import { Router } from 'express';
import { registerSchema, loginSchema, switchOrganizationSchema, changePasswordSchema, idParamSchema } from '@pharmaos/shared';
import { validate } from '@/middleware/validate';
import { authenticate } from '@/middleware/authenticate';
import { authRateLimit } from '@/middleware/rate-limit';
import * as c from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', authRateLimit, validate({ body: registerSchema }), c.register);
authRouter.post('/login', authRateLimit, validate({ body: loginSchema }), c.login);
authRouter.post('/refresh', authRateLimit, c.refresh);
authRouter.post('/logout', optionalAuth, c.logout);

authRouter.get('/me', authenticate, c.me);
authRouter.post('/switch-organization', authenticate, validate({ body: switchOrganizationSchema }), c.switchOrganization);
authRouter.get('/sessions', authenticate, c.listSessions);
authRouter.delete('/sessions/:id', authenticate, validate({ params: idParamSchema }), c.revokeSession);
authRouter.post('/change-password', authenticate, authRateLimit, validate({ body: changePasswordSchema }), c.changePassword);

/** Logout works with either a bearer token or just the refresh cookie. */
function optionalAuth(req: Parameters<typeof authenticate>[0], res: Parameters<typeof authenticate>[1], next: Parameters<typeof authenticate>[2]) {
  if (!req.header('authorization')) return next();
  return authenticate(req, res, (err?: unknown) => (err ? next() : next()));
}
