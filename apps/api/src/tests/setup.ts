import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '@/db/connection';
import { invalidateAccessCache } from '@/middleware/authenticate';

beforeAll(async () => {
  await connectDatabase(process.env.MONGODB_URI!);
  // Ensure unique indexes exist before tests exercise duplicate handling.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  invalidateAccessCache();
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await disconnectDatabase();
});
