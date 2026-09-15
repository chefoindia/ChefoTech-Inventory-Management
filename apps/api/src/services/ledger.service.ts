import type { ClientSession, Types, Model } from 'mongoose';
import type { LedgerEntryDto, PaginationQuery } from '@pharmaos/shared';
import { LedgerEntryModel, type LedgerEntryDoc } from '@/models/ledger-entry.model';
import { CustomerModel } from '@/models/customer.model';
import { SupplierModel } from '@/models/supplier.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { NotFoundError } from '@/lib/errors';

export type PartyType = 'customer' | 'supplier';

export interface LedgerPost {
  partyType: PartyType;
  partyId: Types.ObjectId;
  type: LedgerEntryDoc['type'];
  refType?: string;
  refId?: Types.ObjectId | null;
  refNumber?: string;
  /** Positive increases the party balance (what customer owes / what we owe supplier). */
  debitMinor?: number;
  creditMinor?: number;
  note?: string;
  date?: Date;
}

/**
 * Posts a ledger entry and atomically moves the party's denormalised balance.
 * Must run inside the caller's transaction so the document, ledger and balance commit together.
 */
export async function postLedgerEntry(ctx: RequestContext, post: LedgerPost, session: ClientSession): Promise<LedgerEntryDoc> {
  const debit = post.debitMinor ?? 0;
  const credit = post.creditMinor ?? 0;
  const delta = debit - credit;
  const PartyModel = (post.partyType === 'customer' ? CustomerModel : SupplierModel) as unknown as Model<{ balanceMinor: number }>;

  const party = await PartyModel.findOneAndUpdate(
    { _id: post.partyId, organizationId: ctx.organizationId },
    { $inc: { balanceMinor: delta } },
    { new: true, session, projection: { balanceMinor: 1 } },
  );
  if (!party) throw new NotFoundError(post.partyType === 'customer' ? 'Customer' : 'Supplier');

  const [entry] = await LedgerEntryModel.create(
    [
      {
        organizationId: ctx.organizationId,
        outletId: ctx.outletId ?? null,
        partyType: post.partyType,
        partyId: post.partyId,
        date: post.date ?? new Date(),
        type: post.type,
        refType: post.refType ?? '',
        refId: post.refId ?? null,
        refNumber: post.refNumber ?? '',
        debitMinor: debit,
        creditMinor: credit,
        balanceAfterMinor: party.balanceMinor,
        note: post.note ?? '',
        createdBy: ctx.userId,
      },
    ],
    { session },
  );
  return entry!.toObject() as LedgerEntryDoc;
}

export async function listLedger(
  ctx: RequestContext,
  partyType: PartyType,
  partyId: string,
  query: PaginationQuery & { from?: Date; to?: Date },
) {
  const filter = orgFilter<LedgerEntryDoc>(ctx, {
    partyType,
    partyId,
    ...(query.from || query.to
      ? { date: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } }
      : {}),
  });
  const skip = (query.page - 1) * query.pageSize;
  const [entries, total] = await Promise.all([
    LedgerEntryModel.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(query.pageSize).lean<LedgerEntryDoc[]>(),
    LedgerEntryModel.countDocuments(filter),
  ]);
  const userIds = [...new Set(entries.map((e) => e.createdBy).filter(Boolean).map(String))];
  const users = await UserModel.find(trustedFilter({ _id: { $in: userIds } })).select('name').lean<Pick<UserDoc, '_id' | 'name'>[]>();
  const userMap = new Map(users.map((u) => [String(u._id), u.name]));
  const items: LedgerEntryDto[] = entries.map((e) => ({
    id: String(e._id),
    date: e.date.toISOString(),
    type: e.type,
    refType: e.refType ?? '',
    refId: e.refId ? String(e.refId) : null,
    refNumber: e.refNumber ?? '',
    debitMinor: e.debitMinor ?? 0,
    creditMinor: e.creditMinor ?? 0,
    balanceAfterMinor: e.balanceAfterMinor,
    note: e.note ?? '',
    createdBy: e.createdBy ? { id: String(e.createdBy), name: userMap.get(String(e.createdBy)) ?? '' } : null,
  }));
  return { items, meta: pageMeta(query, total) };
}
