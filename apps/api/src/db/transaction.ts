import mongoose, { type ClientSession } from 'mongoose';

/**
 * Run `fn` inside a MongoDB transaction with automatic retry on transient errors.
 * Requires a replica set (Atlas or local rs). All writes inside must pass `{ session }`.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(
      async () => {
        result = await fn(session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      },
    );
    return result;
  } finally {
    await session.endSession();
  }
}
