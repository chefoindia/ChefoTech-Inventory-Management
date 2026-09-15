import mongoose, { type ClientSession, type Types } from 'mongoose';
import { DEFAULT_NUMBERING, type DocumentType } from '@pharmaos/shared';
import { DocumentSequenceModel } from '@/models/document-sequence.model';
import { OrganizationModel } from '@/models/organization.model';

interface NumberingRule {
  prefix?: string;
  padding?: number;
  resetOnFinancialYear?: boolean;
  perOutlet?: boolean;
}

/** Financial-year key like "2026-27" for a date, given the FY start month (1-12). */
export function financialYearKey(date: Date, startMonth: number): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  if (startMonth === 1) return String(startYear);
  const endYY = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYY}`;
}

export function formatDocumentNumber(prefix: string, fyKey: string | null, value: number, padding: number): string {
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (fyKey) parts.push(fyKey.replace('-', ''));
  parts.push(String(value).padStart(padding, '0'));
  return parts.join('-');
}

/**
 * Reserve the next document number atomically. Must be called inside the same transaction
 * as the document insert so a rolled-back document does not consume a number.
 *
 * Design:
 *  1. Numbering rules are read outside the transaction (settings change rarely, and reading
 *     them inside would pin the transaction snapshot before the counter row exists).
 *  2. The counter row is created outside the transaction with a majority write, so concurrent
 *     first-time callers never race on an upsert inside their transactions.
 *  3. The increment happens inside the transaction and returns the pre-image. Concurrent
 *     transactions on the same row conflict and are retried by the driver, so numbers are
 *     unique and gapless per committed transaction.
 *  4. If the caller's transaction snapshot predates the row creation (first number ever for a
 *     key, in a transaction that already read something), a transient error makes the driver
 *     retry the whole transaction with a fresh snapshot.
 */
export async function nextDocumentNumber(
  organizationId: Types.ObjectId,
  outletId: Types.ObjectId | null,
  documentType: DocumentType,
  session: ClientSession,
  at: Date = new Date(),
): Promise<{ number: string; sequence: number }> {
  const org = await OrganizationModel.findById(organizationId).select('settings.numbering financialYearStartMonth').lean();

  // `numbering` is a Map in the schema; lean() yields a plain object.
  const rules = (org?.settings?.numbering ?? {}) as Record<string, NumberingRule>;
  const rule = rules[documentType] ?? {};
  const prefix = rule.prefix ?? DEFAULT_NUMBERING[documentType].prefix;
  const padding = rule.padding ?? DEFAULT_NUMBERING[documentType].padding;
  const perOutlet = rule.perOutlet ?? true;
  const fyKey = rule.resetOnFinancialYear ? financialYearKey(at, org?.financialYearStartMonth ?? 4) : null;

  const key = { organizationId, outletId: perOutlet ? outletId : null, documentType, fyKey };

  try {
    await DocumentSequenceModel.updateOne(key, { $setOnInsert: { ...key, next: 1 } }, { upsert: true, writeConcern: { w: 'majority' } });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }

  const previous = await DocumentSequenceModel.findOneAndUpdate(key, { $inc: { next: 1 } }, { new: false, session }).lean();
  if (!previous) {
    const retry = new mongoose.mongo.MongoError('Sequence row not visible in transaction snapshot; retrying');
    retry.addErrorLabel('TransientTransactionError');
    throw retry;
  }

  const sequence = previous.next;
  return { number: formatDocumentNumber(prefix, fyKey, sequence, padding), sequence };
}
