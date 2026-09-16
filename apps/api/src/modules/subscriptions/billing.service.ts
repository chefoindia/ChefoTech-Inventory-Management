import type { Types } from 'mongoose';
import type { CheckoutDto, ConfirmCheckoutInput, CreateCheckoutInput, SubscriptionInvoiceDto, BillingStatusDto, PlanKey } from '@pharmaos/shared';
import { env } from '@/config/env';
import { OrganizationModel } from '@/models/organization.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import { SubscriptionInvoiceModel, type SubscriptionInvoiceDoc } from '@/models/subscription-invoice.model';
import type { RequestContext } from '@/lib/context';
import { orgFilter } from '@/lib/scoped';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { audit } from '@/services/audit.service';
import { billingConfigured, createOrder, verifyPaymentSignature, verifyWebhookSignature } from '@/services/payments/razorpay';
import { messagingStatus } from '@/services/messaging/messaging.service';
import { emailProvider } from '@/services/email/email.service';
import { PLANS } from './plans';
import { usage } from './subscriptions.service';

export function billingStatus(): BillingStatusDto {
  const m = messagingStatus();
  return {
    provider: billingConfigured() ? 'razorpay' : 'none',
    keyId: billingConfigured() ? env.RAZORPAY_KEY_ID : '',
    channels: { sms: m.sms, whatsapp: m.whatsapp, push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY), email: emailProvider.name },
  };
}

const iso = (d?: Date | null) => (d ? new Date(d).toISOString() : null);

function toInvoiceDto(d: SubscriptionInvoiceDoc): SubscriptionInvoiceDto {
  return {
    id: String(d._id),
    number: d.number,
    planKey: d.planKey as PlanKey,
    months: d.months,
    amountMinor: d.amountMinor,
    currency: d.currency ?? 'INR',
    status: d.status as SubscriptionInvoiceDto['status'],
    provider: d.provider ?? 'razorpay',
    providerPaymentId: d.providerPaymentId ?? '',
    periodStart: iso(d.periodStart),
    periodEnd: iso(d.periodEnd),
    paidAt: iso(d.paidAt),
    failureReason: d.failureReason ?? '',
    createdAt: iso(d.createdAt) ?? new Date().toISOString(),
  };
}

/** Annual billing: 12 months for the price of 10. */
export function priceFor(planKey: PlanKey, months: 1 | 12): number {
  const plan = PLANS[planKey];
  if (plan.priceMinorPerMonth === null) throw new BusinessRuleError(`${plan.name} is priced per organization; contact sales`);
  return months === 12 ? plan.priceMinorPerMonth * 10 : plan.priceMinorPerMonth;
}

async function assertUsageFits(organizationId: Types.ObjectId, planKey: PlanKey) {
  const plan = PLANS[planKey];
  const use = await usage(organizationId);
  const over: string[] = [];
  if (use.outlets > plan.limits.outlets) over.push(`${use.outlets} outlets (limit ${plan.limits.outlets})`);
  if (use.users > plan.limits.users) over.push(`${use.users} users (limit ${plan.limits.users})`);
  if (use.products > plan.limits.products) over.push(`${use.products} products (limit ${plan.limits.products})`);
  if (over.length) throw new BusinessRuleError(`Current usage exceeds the ${plan.name} plan: ${over.join(', ')}. Pick a larger plan or archive records first.`);
}

/** Creates a gateway order + a pending invoice; the browser completes payment with the public key id. */
export async function createCheckout(ctx: RequestContext, input: CreateCheckoutInput): Promise<CheckoutDto> {
  if (!billingConfigured()) throw new BusinessRuleError('Online payment is not configured for this deployment. Ask support to activate billing.');
  const org = await OrganizationModel.findById(ctx.organizationId).lean();
  if (!org) throw new NotFoundError('Organization');
  await assertUsageFits(ctx.organizationId, input.planKey);
  const amountMinor = priceFor(input.planKey, input.months);
  const count = await SubscriptionInvoiceModel.countDocuments(orgFilter(ctx, {}));
  const number = `SUB-${String(org._id).slice(-6).toUpperCase()}-${String(count + 1).padStart(4, '0')}`;
  const order = await createOrder({ amountMinor, receipt: number, notes: { organizationId: String(org._id), planKey: input.planKey, months: String(input.months) } });
  const invoice = await SubscriptionInvoiceModel.create({ organizationId: org._id, number, planKey: input.planKey, months: input.months, amountMinor, currency: 'INR', status: 'created', provider: 'razorpay', providerOrderId: order.id, createdBy: ctx.userId });
  const user = await UserModel.findById(ctx.userId).select('name email phone').lean<UserDoc>();
  await audit(ctx, { action: 'subscription.checkoutStarted', entityType: 'SubscriptionInvoice', entityId: invoice._id, summary: `Started checkout ${number} for ${PLANS[input.planKey].name} (${input.months} month${input.months === 1 ? '' : 's'})` });
  return {
    invoiceId: String(invoice._id),
    orderId: order.id,
    keyId: env.RAZORPAY_KEY_ID,
    amountMinor,
    currency: 'INR',
    planKey: input.planKey,
    months: input.months,
    description: `PharmaOS ${PLANS[input.planKey].name} plan · ${input.months === 12 ? '12 months' : '1 month'}`,
    prefill: { name: user?.name ?? '', email: user?.email ?? '', contact: user?.phone ?? '' },
  };
}

/** Applies a paid invoice to the organization: plan, limits, status and the period end. Idempotent. */
async function applyPaidInvoice(invoice: SubscriptionInvoiceDoc, paymentId: string, by: string) {
  if (invoice.status === 'paid') return;
  const org = await OrganizationModel.findById(invoice.organizationId);
  if (!org) throw new NotFoundError('Organization');
  const plan = PLANS[invoice.planKey as PlanKey];
  const now = new Date();
  const currentEnd = org.subscription?.currentPeriodEnd && org.subscription.currentPeriodEnd > now && org.subscription.planKey === invoice.planKey ? org.subscription.currentPeriodEnd : now;
  const periodEnd = new Date(currentEnd);
  periodEnd.setMonth(periodEnd.getMonth() + invoice.months);
  const from = org.subscription?.planKey ?? 'trial';
  org.set('subscription', { planKey: invoice.planKey, status: 'active', trialEndsAt: null, currentPeriodEnd: periodEnd, limits: plan.limits });
  org.set('subscriptionHistory', [...((org.get('subscriptionHistory') as unknown[] | undefined) ?? []), { at: now, from, to: invoice.planKey, by }]);
  await org.save();
  await SubscriptionInvoiceModel.updateOne({ _id: invoice._id, status: { $ne: 'paid' } }, { $set: { status: 'paid', providerPaymentId: paymentId, paidAt: now, periodStart: currentEnd, periodEnd } });
}

/** Browser checkout success: verify the gateway signature, then activate the plan. */
export async function confirmCheckout(ctx: RequestContext, input: ConfirmCheckoutInput) {
  const invoice = await SubscriptionInvoiceModel.findOne(orgFilter<SubscriptionInvoiceDoc>(ctx, { providerOrderId: input.orderId }));
  if (!invoice) throw new NotFoundError('Checkout');
  if (!verifyPaymentSignature(input.orderId, input.paymentId, input.signature)) {
    await SubscriptionInvoiceModel.updateOne({ _id: invoice._id, status: 'created' }, { $set: { status: 'failed', failureReason: 'Signature verification failed' } });
    throw new ValidationError('Payment could not be verified');
  }
  await applyPaidInvoice(invoice, input.paymentId, String(ctx.userId));
  await audit(ctx, { action: 'subscription.paid', entityType: 'SubscriptionInvoice', entityId: invoice._id, summary: `Paid ${invoice.number}: ${PLANS[invoice.planKey as PlanKey].name} for ${invoice.months} month(s)` });
  return toInvoiceDto((await SubscriptionInvoiceModel.findById(invoice._id).lean<SubscriptionInvoiceDoc>())!);
}

/** Gateway webhook (payment.captured / payment.failed): the safety net when the browser never returns. */
export async function handleWebhook(rawBody: Buffer, signature: string) {
  if (!verifyWebhookSignature(rawBody, signature)) throw new ValidationError('Invalid webhook signature');
  const event = JSON.parse(rawBody.toString('utf8')) as { event: string; payload?: { payment?: { entity?: { id: string; order_id: string; error_description?: string } } } };
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return { handled: false };
  const invoice = await SubscriptionInvoiceModel.findOne({ providerOrderId: payment.order_id });
  if (!invoice) return { handled: false };
  if (event.event === 'payment.captured') {
    await applyPaidInvoice(invoice, payment.id, 'webhook');
    logger.info({ invoice: invoice.number }, 'subscription paid via webhook');
    return { handled: true };
  }
  if (event.event === 'payment.failed') {
    await SubscriptionInvoiceModel.updateOne({ _id: invoice._id, status: 'created' }, { $set: { status: 'failed', failureReason: payment.error_description ?? 'Payment failed' } });
    return { handled: true };
  }
  return { handled: false };
}

export async function listInvoices(ctx: RequestContext): Promise<SubscriptionInvoiceDto[]> {
  const docs = await SubscriptionInvoiceModel.find(orgFilter<SubscriptionInvoiceDoc>(ctx, {})).sort({ createdAt: -1 }).limit(100).lean<SubscriptionInvoiceDoc[]>();
  return docs.map(toInvoiceDto);
}
