import { Router } from 'express';
import { z } from 'zod';
import {
  inviteUserSchema,
  updateMembershipSchema,
  updateProfileSchema,
  acceptInviteSchema,
  idParamSchema,
  paginationQuerySchema,
  type InviteUserInput,
  type UpdateMembershipInput,
  type UpdateProfileInput,
  type PaginationQuery,
} from '@pharmaos/shared';
import { validate, body, params, query } from '@/middleware/validate';
import { authenticate, ctxOf } from '@/middleware/authenticate';
import { resolveOutlet } from '@/middleware/tenant';
import { requirePermission } from '@/middleware/require-permission';
import { authRateLimit } from '@/middleware/rate-limit';
import { ok, created, noContent, paginated } from '@/lib/response';
import * as users from './users.service';

export const usersRouter = Router();

/* Public invitation endpoints (no auth). */
const tokenParam = z.object({ token: z.string().min(20).max(200) });

usersRouter.get('/invitations/:token', authRateLimit, validate({ params: tokenParam }), async (req, res) => {
  ok(res, await users.previewInvitation(params<{ token: string }>(req).token));
});

usersRouter.post('/invitations/accept', authRateLimit, validate({ body: acceptInviteSchema }), async (req, res) => {
  const { user } = await users.acceptInvitation(body<{ token: string; name?: string; password?: string }>(req));
  ok(res, { email: user.email });
});

/* Authenticated. */
usersRouter.use(authenticate, resolveOutlet);

usersRouter.get('/', requirePermission('users.view'), validate({ query: paginationQuerySchema }), async (req, res) => {
  const { items, meta } = await users.listMembers(ctxOf(req), query<PaginationQuery>(req));
  paginated(res, items, meta);
});

usersRouter.get('/invitations', requirePermission('users.view'), async (req, res) => {
  ok(res, await users.listInvitations(ctxOf(req)));
});

usersRouter.post('/invite', requirePermission('users.manage'), validate({ body: inviteUserSchema }), async (req, res) => {
  created(res, await users.inviteUser(ctxOf(req), body<InviteUserInput>(req)));
});

usersRouter.delete('/invitations/:id', requirePermission('users.manage'), validate({ params: idParamSchema }), async (req, res) => {
  await users.revokeInvitation(ctxOf(req), params<{ id: string }>(req).id);
  noContent(res);
});

usersRouter.patch('/me/profile', validate({ body: updateProfileSchema }), async (req, res) => {
  ok(res, await users.updateProfile(ctxOf(req), body<UpdateProfileInput>(req)));
});

usersRouter.patch('/:id', requirePermission('users.manage'), validate({ params: idParamSchema, body: updateMembershipSchema }), async (req, res) => {
  ok(res, await users.updateMembership(ctxOf(req), params<{ id: string }>(req).id, body<UpdateMembershipInput>(req)));
});
