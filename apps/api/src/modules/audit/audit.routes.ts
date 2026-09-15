import { Router } from 'express';
import { z } from 'zod';
import { paginationQuerySchema, objectIdSchema } from '@pharmaos/shared';
import { validate, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { paginated } from '@/lib/response';
import { pageOptions, pageMeta } from '@/lib/pagination';
import { orgFilter, trustedFilter } from '@/lib/scoped';
import { AuditLogModel, type AuditLogDoc } from '@/models/audit-log.model';
import { UserModel, type UserDoc } from '@/models/user.model';
import { toAuditLogDto } from '@/modules/common/serializers';

export const auditRouter = Router();
auditRouter.use(authenticate, resolveOutlet);

const auditQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: objectIdSchema.optional(),
  userId: objectIdSchema.optional(),
  action: z.string().max(80).optional(),
  outletId: objectIdSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
type AuditQuery = z.infer<typeof auditQuerySchema>;

auditRouter.get('/', requirePermission('audit.view'), validate({ query: auditQuerySchema }), async (req, res) => {
  const ctx = ctxOf(req);
  const q = query<AuditQuery>(req);
  const filter = orgFilter<AuditLogDoc>(ctx, {});
  if (q.entityType) filter.entityType = q.entityType;
  if (q.entityId) filter.entityId = q.entityId;
  if (q.userId) filter.userId = q.userId;
  if (q.action) filter.action = q.action;
  if (q.outletId) filter.outletId = q.outletId;
  if (q.from || q.to) filter.createdAt = { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) };

  const { skip, limit, sort } = pageOptions(q, ['createdAt'], { createdAt: -1 });
  const [logs, total] = await Promise.all([
    AuditLogModel.find(filter).sort(sort).skip(skip).limit(limit).lean<AuditLogDoc[]>(),
    AuditLogModel.countDocuments(filter),
  ]);
  const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean).map(String))];
  const usersList = await UserModel.find(trustedFilter({ _id: { $in: userIds } })).select('name email').lean<Pick<UserDoc, '_id' | 'name' | 'email'>[]>();
  const userMap = new Map(usersList.map((u) => [String(u._id), u]));
  paginated(
    res,
    logs.map((l) => toAuditLogDto(l, l.userId ? userMap.get(String(l.userId)) : null)),
    pageMeta(q, total),
  );
});
