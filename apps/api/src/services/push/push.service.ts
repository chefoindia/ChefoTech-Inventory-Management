import webpush from 'web-push';
import type { Types } from 'mongoose';
import type { PushSubscriptionInput } from '@pharmaos/shared';
import { env, isTest } from '@/config/env';
import { logger } from '@/lib/logger';
import { PushSubscriptionModel, type PushSubscriptionDoc } from '@/models/push-subscription.model';

/** Web Push (VAPID) delivery. Configured only when both VAPID keys are present. */
export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid() {
  if (vapidReady || !pushConfigured()) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  vapidReady = true;
}

export async function subscribe(organizationId: Types.ObjectId, userId: Types.ObjectId, input: PushSubscriptionInput) {
  await PushSubscriptionModel.updateOne({ endpoint: input.endpoint }, { $set: { organizationId, userId, keys: input.keys, userAgent: input.userAgent ?? '', lastUsedAt: new Date() } }, { upsert: true });
}

export async function unsubscribe(userId: Types.ObjectId, endpoint: string) {
  await PushSubscriptionModel.deleteOne({ userId, endpoint });
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Sent-for-tests record when VAPID is not configured (mirrors the console email provider). */
export const pushSent: { userId: string; payload: PushPayload }[] = [];

/** Sends to every device of a user; drops subscriptions the browser reports as gone (404/410). */
export async function sendPushToUser(userId: Types.ObjectId, payload: PushPayload): Promise<{ sent: number; failed: number }> {
  const subs = await PushSubscriptionModel.find({ userId }).lean<PushSubscriptionDoc[]>();
  if (!pushConfigured()) {
    if (isTest || subs.length) pushSent.push({ userId: String(userId), payload });
    return { sent: 0, failed: 0 };
  }
  ensureVapid();
  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    if (!s.keys?.p256dh || !s.keys.auth) continue;
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent += 1;
    } catch (err) {
      failed += 1;
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await PushSubscriptionModel.deleteOne({ _id: s._id });
      else logger.warn({ err, endpoint: s.endpoint.slice(0, 40) }, 'push delivery failed');
    }
  }
  return { sent, failed };
}
