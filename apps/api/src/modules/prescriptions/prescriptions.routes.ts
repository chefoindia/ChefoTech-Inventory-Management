import { Router } from 'express';
import { z } from 'zod';
import { createPrescriptionSchema, updatePrescriptionSchema, prescriptionListQuerySchema, idParamSchema, type CreatePrescriptionInput, type UpdatePrescriptionInput, type PrescriptionListQuery } from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { ok, created, paginated } from '@/lib/response';
import * as svc from './prescriptions.service';

export const prescriptionsRouter = Router();
prescriptionsRouter.use(authenticate, resolveOutlet);

prescriptionsRouter.get('/', requirePermission('prescriptions.view'), validate({ query: prescriptionListQuerySchema }), async (req, res) => {
  const { items, meta } = await svc.listPrescriptions(ctxOf(req), query<PrescriptionListQuery>(req));
  paginated(res, items, meta);
});
prescriptionsRouter.get('/:id', requirePermission('prescriptions.view'), validate({ params: idParamSchema }), async (req, res) => {
  ok(res, await svc.getPrescription(ctxOf(req), params<{ id: string }>(req).id));
});
prescriptionsRouter.get('/:id/files/url', requirePermission('prescriptions.view'), validate({ params: idParamSchema, query: z.object({ publicId: z.string().min(1) }) }), async (req, res) => {
  ok(res, await svc.fileUrl(ctxOf(req), params<{ id: string }>(req).id, query<{ publicId: string }>(req).publicId));
});
prescriptionsRouter.post('/', requirePermission('prescriptions.manage'), validate({ body: createPrescriptionSchema }), async (req, res) => {
  created(res, await svc.createPrescription(ctxOf(req), body<CreatePrescriptionInput>(req)));
});
prescriptionsRouter.patch('/:id', requirePermission('prescriptions.manage'), validate({ params: idParamSchema, body: updatePrescriptionSchema }), async (req, res) => {
  ok(res, await svc.updatePrescription(ctxOf(req), params<{ id: string }>(req).id, body<UpdatePrescriptionInput>(req)));
});
