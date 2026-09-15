import { Router } from 'express';
import { z } from 'zod';
import { notificationListQuerySchema, notificationRulesUpdateSchema, idParamSchema, NOTIFICATION_TYPES, type NotificationRuleInput, type PaginationQuery } from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, noContent } from '@/lib/response';
import * as svc from './notifications.service';
import { runAllScans } from './notification-jobs';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate, resolveOutlet);

notificationsRouter.get('/', requirePermission('notifications.view'), validate({ query: notificationListQuerySchema }), async (req, res) => {
  const { items, meta, unread } = await svc.listNotifications(ctxOf(req), query<PaginationQuery & { unreadOnly: boolean; type?: string }>(req));
  res.status(200).json({ success: true, data: items, meta: { ...meta, unread } });
});
notificationsRouter.get('/unread-count', requirePermission('notifications.view'), async (req, res) => {
  ok(res, { unread: await svc.unreadCount(ctxOf(req)) });
});
notificationsRouter.post('/read-all', requirePermission('notifications.view'), async (req, res) => {
  await svc.markAllRead(ctxOf(req));
  noContent(res);
});
notificationsRouter.post('/:id/read', requirePermission('notifications.view'), validate({ params: idParamSchema }), async (req, res) => {
  await svc.markRead(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});

notificationsRouter.get('/preferences', requirePermission('notifications.view'), async (req, res) => {
  ok(res, await svc.getPreferences(ctxOf(req)));
});
notificationsRouter.put('/preferences', requirePermission('notifications.view'), validate({ body: z.object({ mutedTypes: z.array(z.enum(NOTIFICATION_TYPES)).default([]), emailDigest: z.enum(['none', 'daily']).default('none') }) }), async (req, res) => {
  ok(res, await svc.updatePreferences(ctxOf(req), body<{ mutedTypes: string[]; emailDigest: 'none' | 'daily' }>(req)));
});

notificationsRouter.get('/rules', requirePermission('notifications.manage'), async (req, res) => {
  ok(res, await svc.getRules(ctxOf(req).organizationId));
});
notificationsRouter.put('/rules', requirePermission('notifications.manage'), validate({ body: notificationRulesUpdateSchema }), async (req, res) => {
  ok(res, await svc.updateRules(ctxOf(req), body<{ rules: NotificationRuleInput[] }>(req).rules));
});
/** Run the periodic scans now (owner/admin) — useful after imports or for testing rules. */
notificationsRouter.post('/scan', requirePermission('notifications.manage'), async (req, res) => {
  ok(res, await runAllScans(ctxOf(req).organizationId));
});
