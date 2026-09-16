import type { Types } from 'mongoose';
import type { SubscriptionDto, PlanKey, FeatureKey } from '@pharmaos/shared';
import { OrganizationModel, type OrganizationDoc } from '@/models/organization.model';
import { OutletModel } from '@/models/outlet.model';
import { MembershipModel } from '@/models/membership.model';
import { ProductModel } from '@/models/product.model';
import { SaleModel } from '@/models/sale.model';
import { GeneratedDocumentModel } from '@/models/generated-document.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { BusinessRuleError, NotFoundError, PlanLimitError } from '@/lib/errors';
import { audit } from '@/services/audit.service';
import { PLANS, planFor } from './plans';
import { billingStatus } from './billing.service';

/** Live status: trial that has ended is treated as past_due (read-only prompts in the UI, limits still enforced). */
export function effectiveStatus(org: Pick<OrganizationDoc, 'subscription'>): SubscriptionDto['status'] {
  const s = org.subscription?.status ?? 'trialing';
  if (s === 'trialing' && org.subscription?.trialEndsAt && org.subscription.trialEndsAt < new Date()) return 'past_due';
  return s as SubscriptionDto['status'];
}

export async function usage(organizationId: Types.ObjectId) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [outlets, users, products, invoicesThisMonth, storage] = await Promise.all([
    OutletModel.countDocuments(trustedFilter({ organizationId, status: { $ne: 'archived' } })),
    MembershipModel.countDocuments(trustedFilter({ organizationId, status: { $ne: 'suspended' } })),
    ProductModel.countDocuments(trustedFilter({ organizationId, status: { $ne: 'archived' } })),
    SaleModel.countDocuments(trustedFilter({ organizationId, status: 'completed', completedAt: { $gte: monthStart } })),
    GeneratedDocumentModel.aggregate<{ bytes: number }>([{ $match: { organizationId } }, { $group: { _id: null, bytes: { $sum: '$bytes' } } }]),
  ]);
  return { outlets, users, products, invoicesThisMonth, storageMb: Math.round(((storage[0]?.bytes ?? 0) / (1024 * 1024)) * 10) / 10 };
}

export async function getSubscription(ctx: RequestContext): Promise<SubscriptionDto> {
  const org = await OrganizationModel.findById(ctx.organizationId).lean<OrganizationDoc & { subscriptionHistory?: { at: Date; from: string; to: string; by: string }[] }>();
  if (!org) throw new NotFoundError('Organization');
  const plan = planFor(org.subscription?.planKey);
  return {
    plan,
    status: effectiveStatus(org),
    trialEndsAt: org.subscription?.trialEndsAt ? org.subscription.trialEndsAt.toISOString() : null,
    currentPeriodEnd: org.subscription?.currentPeriodEnd ? new Date(org.subscription.currentPeriodEnd).toISOString() : null,
    usage: await usage(ctx.organizationId),
    limits: { ...plan.limits, ...(org.subscription?.limits ?? {}) },
    features: plan.features,
    history: (org.subscriptionHistory ?? []).map((h) => ({ at: h.at ? new Date(h.at).toISOString() : '', from: h.from ?? '', to: h.to ?? '', by: h.by ?? '' })),
    billing: billingStatus(),
  };
}

/**
 * Plan change without a payment provider: recorded, audited and applied immediately. When billing
 * is connected this becomes the post-checkout webhook handler; the entitlement surface is unchanged.
 */
export async function changePlan(ctx: RequestContext, planKey: PlanKey) {
  const org = await OrganizationModel.findById(ctx.organizationId);
  if (!org) throw new NotFoundError('Organization');
  if (planKey === 'trial') throw new BusinessRuleError('The trial plan cannot be re-selected');
  const plan = PLANS[planKey];
  const use = await usage(ctx.organizationId);
  const over: string[] = [];
  if (use.outlets > plan.limits.outlets) over.push(`${use.outlets} outlets (limit ${plan.limits.outlets})`);
  if (use.users > plan.limits.users) over.push(`${use.users} users (limit ${plan.limits.users})`);
  if (use.products > plan.limits.products) over.push(`${use.products} products (limit ${plan.limits.products})`);
  if (over.length) throw new PlanLimitError(`Current usage exceeds the ${plan.name} plan: ${over.join(', ')}. Archive some records or pick a larger plan.`);
  const from = org.subscription?.planKey ?? 'trial';
  org.set('subscription', { planKey, status: 'active', trialEndsAt: null, currentPeriodEnd: null, limits: plan.limits });
  org.set('subscriptionHistory', [...((org.get('subscriptionHistory') as unknown[] | undefined) ?? []), { at: new Date(), from, to: planKey, by: String(ctx.userId) }]);
  await org.save();
  await audit(ctx, { action: 'subscription.planChanged', entityType: 'Organization', entityId: org._id, summary: `Changed plan from ${from} to ${planKey}`, before: { planKey: from }, after: { planKey } });
  return getSubscription(ctx);
}

/** True when the organization's plan includes the feature. */
export async function hasFeature(organizationId: Types.ObjectId, feature: FeatureKey): Promise<boolean> {
  const org = await OrganizationModel.findById(organizationId).select('subscription').lean<OrganizationDoc>();
  if (!org) return false;
  return planFor(org.subscription?.planKey).features.includes(feature);
}

export async function assertWithinLimit(ctx: RequestContext, metric: 'outlets' | 'users' | 'products') {
  const org = await OrganizationModel.findOne(orgFilter(ctx, { _id: ctx.organizationId })).select('subscription').lean<OrganizationDoc>();
  const plan = planFor(org?.subscription?.planKey);
  const limit = org?.subscription?.limits?.[metric] ?? plan.limits[metric];
  const use = await usage(ctx.organizationId);
  if (use[metric] >= limit) throw new PlanLimitError(`Your plan allows ${limit} ${metric}. Upgrade to add more.`);
}
