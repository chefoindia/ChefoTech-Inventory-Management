import { Router } from 'express';
import { createLeadSchema, type CreateLeadInput } from '@pharmaos/shared';
import { validate, body } from '@/middleware/validate';
import { leadRateLimit } from '@/middleware/rate-limit';
import { created } from '@/lib/response';
import * as svc from './leads.service';

/** Public: demo, sales and contact forms on the marketing website. */
export const leadsRouter = Router();

leadsRouter.post('/', leadRateLimit, validate({ body: createLeadSchema }), async (req, res, next) => {
  try {
    const input = body<CreateLeadInput>(req);
    created(res, await svc.createLead(input, { ip: req.ip, userAgent: req.get('user-agent') ?? '' }));
  } catch (err) {
    next(err);
  }
});
