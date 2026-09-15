import { EventEmitter } from 'node:events';
import type { Types } from 'mongoose';
import { logger } from './logger';

/**
 * Typed in-process domain event bus. Emitters never await handlers, so a failing
 * notification can never break a financial transaction. Can be swapped for a queue later.
 */
export interface DomainEvents {
  'organization.created': { organizationId: Types.ObjectId; ownerUserId: Types.ObjectId };
  'user.invited': { organizationId: Types.ObjectId; invitationId: Types.ObjectId; email: string; token: string };
  'auth.login': { userId: Types.ObjectId; organizationId: Types.ObjectId };
  'sale.completed': { organizationId: Types.ObjectId; outletId: Types.ObjectId; saleId: Types.ObjectId; sendEmail: boolean };
  'stock.changed': { organizationId: Types.ObjectId; outletId: Types.ObjectId; productId: Types.ObjectId };
}

type Handler<K extends keyof DomainEvents> = (payload: DomainEvents[K]) => void | Promise<void>;

class DomainEventBus {
  private emitter = new EventEmitter({ captureRejections: false });

  on<K extends keyof DomainEvents>(event: K, handler: Handler<K>): () => void {
    const wrapped = (payload: DomainEvents[K]) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => logger.error({ err, event }, 'domain event handler failed'));
    };
    this.emitter.on(event, wrapped);
    return () => this.emitter.off(event, wrapped);
  }

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

export const events = new DomainEventBus();
