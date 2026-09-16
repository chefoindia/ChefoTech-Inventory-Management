import { Router } from 'express';
import { aiSettingsPatchSchema, aiApiKeySchema, aiChatSchema, aiExtractSchema, type AiSettingsPatch, type AiChatInput, type AttachmentRef } from '@pharmaos/shared';
import { validate, body } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { heavyRateLimit } from '@/middleware/rate-limit';
import { ok } from '@/lib/response';
import * as settings from './ai-settings.service';
import * as ai from './ai.service';

export const aiRouter = Router();
aiRouter.use(authenticate, resolveOutlet);

/* settings (owner / ai.manage) */
aiRouter.get('/settings', requirePermission(['ai.manage', 'ai.use'], 'any'), async (req, res) => {
  ok(res, await settings.getSettings(ctxOf(req)));
});
aiRouter.patch('/settings', requirePermission('ai.manage'), validate({ body: aiSettingsPatchSchema }), async (req, res) => {
  ok(res, await settings.updateSettings(ctxOf(req), body<AiSettingsPatch>(req)));
});
aiRouter.post('/key', requirePermission('ai.manage'), heavyRateLimit, validate({ body: aiApiKeySchema }), async (req, res) => {
  ok(res, await settings.setApiKey(ctxOf(req), body<{ apiKey: string }>(req).apiKey));
});
aiRouter.delete('/key', requirePermission('ai.manage'), async (req, res) => {
  ok(res, await settings.removeApiKey(ctxOf(req)));
});
aiRouter.post('/test', requirePermission('ai.manage'), heavyRateLimit, async (req, res) => {
  ok(res, await settings.testConnection(ctxOf(req)));
});

/* assistant */
aiRouter.post('/chat', requirePermission('ai.use'), heavyRateLimit, validate({ body: aiChatSchema }), async (req, res) => {
  ok(res, await ai.chat(ctxOf(req), body<AiChatInput>(req)));
});
aiRouter.post('/extract/invoice', requirePermission('ai.use'), heavyRateLimit, validate({ body: aiExtractSchema }), async (req, res) => {
  const b = body<{ attachment: AttachmentRef; supplierId?: string }>(req);
  ok(res, await ai.extractInvoice(ctxOf(req), b.attachment, b.supplierId));
});
aiRouter.post('/extract/prescription', requirePermission('ai.use'), heavyRateLimit, validate({ body: aiExtractSchema }), async (req, res) => {
  ok(res, await ai.extractPrescription(ctxOf(req), body<{ attachment: AttachmentRef }>(req).attachment));
});
