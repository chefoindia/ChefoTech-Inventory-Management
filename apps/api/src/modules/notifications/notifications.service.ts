import { Types } from 'mongoose';
import { NOTIFICATION_CATALOGUE, NOTIFICATION_TYPES, type NotificationDto, type NotificationRuleDto, type NotificationRuleInput, type NotificationType, type PaginationQuery } from '@pharmaos/shared';
import { NotificationModel, NotificationRuleModel, NotificationPreferenceModel, type NotificationDoc, type NotificationRuleDoc } from '@/models/notification.model';
import { MembershipModel, type MembershipDoc } from '@/models/membership.model';
import { RoleModel, type RoleDoc } from '@/models/role.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import { OrganizationModel } from '@/models/organization.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { pageMeta } from '@/lib/pagination';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/services/email/email.service';
import { audit } from '@/services/audit.service';
import { isoNow } from '@/modules/common/refs';

/* ---------------------------------------------------------------- channels */

export interface NotificationChannelAdapter {
  readonly channel: string;
  /** Deliver to a concrete recipient; adapters must never throw. */
  deliver(notification: NotificationDoc, recipient: { email: string; phone: string; name: string }): Promise<{ status: 'sent' | 'failed' | 'skipped'; error?: string }>;
}

const emailChannel: NotificationChannelAdapter = {
  channel: 'email',
  async deliver(n, r) {
    if (!r.email) return { status: 'skipped' };
    try {
      await sendEmail({ to: [{ email: r.email, name: r.name }], subject: `[PharmaOS] ${n.title}`, html: `<p>${n.title}</p><p>${n.body}</p>`, text: `${n.title}\n${n.body}`, tags: ['notification', n.type] });
      return { status: 'sent' };
    } catch (err) {
      return { status: 'failed', error: (err as Error).message.slice(0, 200) };
    }
  },
};

/** SMS / WhatsApp / push are architected as adapters; until a provider is configured they report `skipped`. */
const placeholderChannel = (channel: string): NotificationChannelAdapter => ({ channel, async deliver() { return { status: 'skipped', error: `${channel} provider not configured` }; } });

const CHANNELS: Record<string, NotificationChannelAdapter> = { email: emailChannel, sms: placeholderChannel('sms'), whatsapp: placeholderChannel('whatsapp'), push: placeholderChannel('push') };

/* ---------------------------------------------------------------- rules */

export async function getRules(organizationId: Types.ObjectId): Promise<NotificationRuleDto[]> {
  const stored = await NotificationRuleModel.find({ organizationId }).lean<NotificationRuleDoc[]>();
  const byType = new Map(stored.map((r) => [r.type, r]));
  return NOTIFICATION_TYPES.map((type) => {
    const cat = NOTIFICATION_CATALOGUE[type];
    const r = byType.get(type);
    return {
      type,
      enabled: r?.enabled ?? true,
      channels: (r?.channels ?? ['inApp']) as NotificationRuleDto['channels'],
      roleKeys: r?.roleKeys ?? [],
      threshold: r?.threshold ?? cat.defaultThreshold,
      label: cat.label,
      description: cat.description,
      defaultThreshold: cat.defaultThreshold,
      thresholdLabel: cat.thresholdLabel,
    };
  });
}

export async function updateRules(ctx: RequestContext, rules: NotificationRuleInput[]) {
  for (const r of rules) {
    await NotificationRuleModel.updateOne({ organizationId: ctx.organizationId, type: r.type }, { $set: { enabled: r.enabled, channels: r.channels, roleKeys: r.roleKeys, threshold: r.threshold ?? null } }, { upsert: true });
  }
  await audit(ctx, { action: 'notifications.rulesUpdated', entityType: 'NotificationRule', summary: `Updated ${rules.length} notification rule(s)`, after: rules });
  return getRules(ctx.organizationId);
}

/* ---------------------------------------------------------------- creation */

export interface NotifyInput {
  organizationId: Types.ObjectId;
  outletId?: Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: Types.ObjectId | null;
  href?: string;
  /** Same key while the condition persists → no duplicate alert. */
  dedupeKey?: string;
  /** Target a specific user instead of everyone with the permission. */
  userId?: Types.ObjectId | null;
}

/**
 * Creates an in-app notification (honouring rules + dedupe) and fans out to other channels.
 * Never throws: notifications must not break business flows.
 */
export async function notify(input: NotifyInput): Promise<NotificationDoc | null> {
  try {
    const cat = NOTIFICATION_CATALOGUE[input.type];
    const rule = await NotificationRuleModel.findOne({ organizationId: input.organizationId, type: input.type }).lean<NotificationRuleDoc>();
    if (rule && !rule.enabled) return null;
    const channels = rule?.channels ?? ['inApp'];
    if (input.dedupeKey) {
      const open = await NotificationModel.findOne({ organizationId: input.organizationId, dedupeKey: input.dedupeKey }).lean<NotificationDoc>();
      if (open) return null;
    }
    const doc = await NotificationModel.create({
      organizationId: input.organizationId,
      outletId: input.outletId ?? null,
      userId: input.userId ?? null,
      permission: cat.permission,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      severity: cat.severity,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      href: input.href ?? null,
      dedupeKey: input.dedupeKey ?? null,
      channels,
    });
    const external = channels.filter((c) => c !== 'inApp');
    if (external.length) void fanOut(doc.toObject() as NotificationDoc, external, rule?.roleKeys ?? []);
    return doc.toObject() as NotificationDoc;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) logger.warn({ err, type: input.type }, 'notification create failed');
    return null;
  }
}

/** Resolve recipients: explicit user, else members whose role has the permission (optionally restricted to roleKeys). */
async function recipients(n: NotificationDoc, roleKeys: string[]) {
  if (n.userId) {
    const u = await UserModel.findById(n.userId).select('email phone name').lean<UserDoc>();
    return u ? [{ email: u.email, phone: u.phone ?? '', name: u.name, userId: u._id }] : [];
  }
  const roles = await RoleModel.find(trustedFilter({ organizationId: n.organizationId, status: 'active', ...(roleKeys.length ? { key: { $in: roleKeys } } : { $or: [{ permissions: n.permission }, { key: 'owner' }] }) })).select('_id').lean<Pick<RoleDoc, '_id'>[]>();
  const members = await MembershipModel.find(trustedFilter({ organizationId: n.organizationId, status: 'active', roleId: { $in: roles.map((r) => r._id) }, ...(n.outletId ? { $or: [{ 'outletAccess.all': true }, { isOwner: true }, { 'outletAccess.outletIds': n.outletId }] } : {}) })).select('userId').lean<Pick<MembershipDoc, 'userId'>[]>();
  const users = await UserModel.find(trustedFilter({ _id: { $in: members.map((m) => m.userId) }, status: 'active' })).select('email phone name').lean<UserDoc[]>();
  const prefs = await NotificationPreferenceModel.find(trustedFilter({ organizationId: n.organizationId, userId: { $in: users.map((u) => u._id) } })).lean();
  const muted = new Set(prefs.filter((p) => (p.mutedTypes ?? []).includes(n.type)).map((p) => String(p.userId)));
  return users.filter((u) => !muted.has(String(u._id))).map((u) => ({ email: u.email, phone: u.phone ?? '', name: u.name, userId: u._id }));
}

async function fanOut(n: NotificationDoc, channels: string[], roleKeys: string[]) {
  try {
    const targets = await recipients(n, roleKeys);
    const deliveries: { channel: string; status: string; error: string }[] = [];
    for (const channel of channels) {
      const adapter = CHANNELS[channel];
      if (!adapter) continue;
      for (const r of targets.slice(0, 50)) {
        const res = await adapter.deliver(n, r);
        deliveries.push({ channel, status: res.status, error: res.error ?? '' });
      }
    }
    if (deliveries.length) await NotificationModel.updateOne({ _id: n._id }, { $push: { deliveries: { $each: deliveries.map((d) => ({ ...d, at: new Date() })) } } });
  } catch (err) {
    logger.warn({ err, notificationId: n._id }, 'notification fan-out failed');
  }
}

/** Closes open deduped alerts whose condition no longer holds (e.g. stock replenished). */
export async function resolveAlert(organizationId: Types.ObjectId, dedupeKey: string) {
  await NotificationModel.updateOne({ organizationId, dedupeKey }, { $set: { dedupeKey: null, expiresAt: new Date(Date.now() + 7 * 86_400_000) } });
}

/* ---------------------------------------------------------------- reads */

function toDto(n: NotificationDoc, userId: Types.ObjectId): NotificationDto {
  return {
    id: String(n._id),
    type: n.type as NotificationType,
    title: n.title,
    body: n.body ?? '',
    severity: n.severity as NotificationDto['severity'],
    entityType: n.entityType ?? null,
    entityId: n.entityId ? String(n.entityId) : null,
    href: n.href ?? null,
    outletId: n.outletId ? String(n.outletId) : null,
    readAt: (n.readBy ?? []).some((id) => String(id) === String(userId)) ? isoNow(n.updatedAt) : null,
    createdAt: isoNow(n.createdAt),
  };
}

function visibilityFilter(ctx: RequestContext) {
  const perms = ctx.isOwner ? null : [...ctx.permissions];
  return {
    $or: [
      { userId: ctx.userId },
      { userId: null, ...(perms ? { permission: { $in: [...perms, ''] } } : {}), ...(ctx.outletAccess ? { $or: [{ outletId: null }, { outletId: { $in: ctx.outletAccess } }] } : {}) },
    ],
  };
}

export async function listNotifications(ctx: RequestContext, query: PaginationQuery & { unreadOnly: boolean; type?: string }) {
  const filter = orgFilter<NotificationDoc>(ctx, { ...visibilityFilter(ctx), ...(query.type ? { type: query.type } : {}), ...(query.unreadOnly ? { readBy: { $ne: ctx.userId } } : {}) });
  const skip = (query.page - 1) * query.pageSize;
  const [docs, total, unread] = await Promise.all([
    NotificationModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.pageSize).lean<NotificationDoc[]>(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments(orgFilter<NotificationDoc>(ctx, { ...visibilityFilter(ctx), readBy: { $ne: ctx.userId } })),
  ]);
  return { items: docs.map((d) => toDto(d, ctx.userId)), meta: pageMeta(query, total), unread };
}

export async function unreadCount(ctx: RequestContext) {
  return NotificationModel.countDocuments(orgFilter<NotificationDoc>(ctx, { ...visibilityFilter(ctx), readBy: { $ne: ctx.userId } }));
}

export async function markRead(ctx: RequestContext, id: string) {
  const res = await NotificationModel.updateOne(orgFilter<NotificationDoc>(ctx, { _id: id }), { $addToSet: { readBy: ctx.userId } });
  if (res.matchedCount === 0) throw new NotFoundError('Notification');
}

export async function markAllRead(ctx: RequestContext) {
  await NotificationModel.updateMany(orgFilter<NotificationDoc>(ctx, { ...visibilityFilter(ctx), readBy: { $ne: ctx.userId } }), { $addToSet: { readBy: ctx.userId } });
}

export async function getPreferences(ctx: RequestContext) {
  const p = await NotificationPreferenceModel.findOne({ organizationId: ctx.organizationId, userId: ctx.userId }).lean();
  return { mutedTypes: p?.mutedTypes ?? [], emailDigest: p?.emailDigest ?? 'none' };
}

export async function updatePreferences(ctx: RequestContext, input: { mutedTypes: string[]; emailDigest: 'none' | 'daily' }) {
  await NotificationPreferenceModel.updateOne({ organizationId: ctx.organizationId, userId: ctx.userId }, { $set: input }, { upsert: true });
  return getPreferences(ctx);
}

/** Threshold for a type (rule override or catalogue default). */
export async function thresholdFor(organizationId: Types.ObjectId, type: NotificationType): Promise<number> {
  const rule = await NotificationRuleModel.findOne({ organizationId, type }).lean<NotificationRuleDoc>();
  if (rule?.threshold !== null && rule?.threshold !== undefined) return rule.threshold;
  const org = await OrganizationModel.findById(organizationId).select('settings.inventory').lean();
  if (type === 'stock.expiringSoon') return Math.min(...(org?.settings?.inventory?.expiryWarningDays ?? [30]));
  return NOTIFICATION_CATALOGUE[type].defaultThreshold ?? 0;
}
