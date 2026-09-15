import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { canAccessOutlet } from '@/lib/context';
import { OutletModel } from '@/models/outlet.model';
import { trustedFilter } from '@/lib/scoped';

/**
 * Reads X-Outlet-Id, verifies it belongs to the caller's organization and that the caller's
 * membership grants it, then sets ctx.outletId. Use `requireOutlet` on outlet-scoped routes.
 */
export const resolveOutlet: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header('x-outlet-id');
    if (!header || !req.ctx) return next();
    if (!Types.ObjectId.isValid(header)) throw new ValidationError('Invalid X-Outlet-Id header');

    const outletId = new Types.ObjectId(header);
    if (!canAccessOutlet(req.ctx, outletId)) throw new ForbiddenError('You do not have access to this outlet');

    const outlet = await OutletModel.exists(trustedFilter({
      _id: outletId,
      organizationId: req.ctx.organizationId,
      status: { $ne: 'archived' },
    }));
    if (!outlet) throw new ForbiddenError('You do not have access to this outlet');

    req.ctx.outletId = outletId;
    next();
  } catch (err) {
    next(err);
  }
};

export const requireOutlet: RequestHandler = (req, _res, next) => {
  if (!req.ctx?.outletId) return next(new ValidationError('Select an outlet first (X-Outlet-Id header missing)'));
  next();
};
