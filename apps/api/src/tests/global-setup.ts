import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/**
 * Starts one in-memory replica set for the whole test run (transactions need a replica set).
 * The URI is passed to workers through process.env.
 */
export async function setup() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri('pharmaos_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-1234567890';
  process.env.BREVO_API_KEY = '';
}

export async function teardown() {
  await replSet?.stop();
}
