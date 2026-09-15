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
import { customFieldsRouter } from '@/modules/custom-fields/custom-fields.routes';
import { attachmentsRouter } from '@/modules/attachments/attachments.routes';
import { unitsRouter, categoriesRouter, productsRouter } from '@/modules/catalog/catalog.routes';
import { suppliersRouter, customersRouter } from '@/modules/parties/parties.routes';
import { inventoryRouter, transfersRouter } from '@/modules/inventory/inventory.routes';
import { purchasesRouter, grnRouter, purchaseReturnsRouter } from '@/modules/purchases/purchases.routes';
import { customerPaymentsRouter, supplierPaymentsRouter } from '@/modules/parties/payments.routes';
import { salesRouter, salesReturnsRouter } from '@/modules/sales/sales.routes';
import { prescriptionsRouter } from '@/modules/prescriptions/prescriptions.routes';
import { importsRouter } from '@/modules/imports/import.routes';
import { exportsRouter } from '@/modules/exports/export.routes';
import { templatesRouter, documentsRouter } from '@/modules/documents/documents.routes';
import { registerDocumentEventHandlers } from '@/modules/documents/document-events';
import { notificationsRouter } from '@/modules/notifications/notifications.routes';
import { registerNotificationEventHandlers } from '@/modules/notifications/notification-jobs';
import { reportsRouter } from '@/modules/reports/reports.routes';
import { dashboardRouter } from '@/modules/dashboard/dashboard.routes';
import { subscriptionRouter } from '@/modules/subscriptions/subscriptions.routes';
import { requireFeature } from '@/middleware/entitlement';
import { authenticate } from '@/middleware/authenticate';

registerDocumentEventHandlers();
registerNotificationEventHandlers();

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
  api.use('/custom-fields', customFieldsRouter);
  api.use('/attachments', attachmentsRouter);
  api.use('/units', unitsRouter);
  api.use('/categories', categoriesRouter);
  api.use('/products', productsRouter);
  api.use('/suppliers', suppliersRouter);
  api.use('/customers', customersRouter);
  api.use('/inventory', inventoryRouter);
  api.use('/transfers', authenticate, requireFeature('stockTransfers'), transfersRouter);
  api.use('/purchases', purchasesRouter);
  api.use('/grns', grnRouter);
  api.use('/purchase-returns', purchaseReturnsRouter);
  api.use('/customer-payments', customerPaymentsRouter);
  api.use('/supplier-payments', supplierPaymentsRouter);
  api.use('/sales', salesRouter);
  api.use('/sales-returns', salesReturnsRouter);
  api.use('/prescriptions', prescriptionsRouter);
  api.use('/imports', authenticate, requireFeature('importExport'), importsRouter);
  api.use('/exports', authenticate, requireFeature('importExport'), exportsRouter);
  api.use('/templates', authenticate, requireFeature('templateDesigner'), templatesRouter);
  api.use('/documents', documentsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/reports', reportsRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/subscription', subscriptionRouter);
  app.use(env.API_BASE_PATH, api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
