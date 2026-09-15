import type { ClientSession, Types } from 'mongoose';
import { AuditLogModel } from '@/models/audit-log.model';
import { logger } from '@/lib/logger';
import type { RequestContext } from '@/lib/context';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: Types.ObjectId | string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

type Actor = Pick<RequestContext, 'organizationId' | 'userId' | 'requestId'> &
  Partial<Pick<RequestContext, 'outletId' | 'ip' | 'userAgent'>>;

const REDACT_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'previousTokenHash', 'passwordResetTokenHash']);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/** Keep only the keys that changed between before and after. */
export function diffObjects(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  if (!before || !after) return { before, after };
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      b[k] = before[k];
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

/**
 * Writes an audit entry. When a session is supplied the entry is part of the caller's
 * transaction; otherwise it is fire-and-forget so auditing never breaks the main request.
 */
export async function audit(actor: Actor, entry: AuditEntry, session?: ClientSession): Promise<void> {
  const doc = {
    organizationId: actor.organizationId,
    outletId: actor.outletId ?? null,
    userId: actor.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary,
    before: redact(entry.before ?? null),
    after: redact(entry.after ?? null),
    metadata: entry.metadata ?? null,
    ip: actor.ip ?? '',
    userAgent: actor.userAgent ?? '',
    requestId: actor.requestId,
  };
  if (session) {
    await AuditLogModel.create([doc], { session });
    return;
  }
  AuditLogModel.create(doc).catch((err) => logger.error({ err, action: entry.action }, 'audit write failed'));
}
