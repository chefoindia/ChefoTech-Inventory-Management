import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { env } from '@/config/env';
import { requestId } from '@/middleware/request-id';
import { httpLogger } from '@/middleware/http-logger';
import { securityHeaders, corsPolicy } from '@/middleware/security';
import { globalRateLimit } from '@/middleware/rate-limit';
import { sanitizeRequest } from '@/middleware/sanitize';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { authRouter } from '@/modules/auth/auth.routes';
import { organizationsRouter } from '@/modules/organizations/organizations.routes';
import { outletsRouter } from '@/modules/outlets/outlets.routes';
import { usersRouter } from '@/modules/users/users.routes';
import { rolesRouter } from '@/modules/roles/roles.routes';
import { auditRouter } from '@/modules/audit/audit.routes';

/**
 * Middleware order: request-id → logging → security headers → CORS → body parsing → cookies →
 * operator-injection guard → global rate limit → routers (each router applies `authenticate`
 * + `resolveOutlet` itself) → 404 → error envelope.
 */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  app.use(requestId);
  app.use(httpLogger);
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);
  app.use(globalRateLimit);

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      time: new Date().toISOString(),
    });
  });

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/organization', organizationsRouter);
  api.use('/outlets', outletsRouter);
  api.use('/users', usersRouter);
  api.use('/roles', rolesRouter);
  api.use('/audit-logs', auditRouter);
  app.use(env.API_BASE_PATH, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
