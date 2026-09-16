import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;
let dataDir: string | undefined;

/**
 * Starts one in-memory replica set for the whole test run (transactions need a replica set).
 * The URI is passed to workers through process.env.
 *
 * The data directory lives next to the cached binary (inside the repo's node_modules) instead of
 * the OS temp folder, so a full system drive does not break the suite and the files are cleaned
 * up with the workspace. Override with PHARMAOS_TEST_DBPATH.
 */
export async function setup() {
  const base = process.env.PHARMAOS_TEST_DBPATH ?? path.resolve(process.cwd(), '../../node_modules/.cache/mongodb-memory-server/data');
  dataDir = path.join(base, `run-${process.pid}-${Date.now()}`);
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch {
    dataDir = path.join(tmpdir(), `pharmaos-test-${process.pid}`);
    mkdirSync(dataDir, { recursive: true });
  }
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ dbPath: dataDir, storageEngine: 'wiredTiger' }],
  });
  process.env.MONGODB_URI = replSet.getUri('pharmaos_test');
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-1234567890';
  process.env.BREVO_API_KEY = '';
}

export async function teardown() {
  await replSet?.stop({ doCleanup: true, force: true });
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
