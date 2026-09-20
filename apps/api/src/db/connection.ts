import dns from 'node:dns';
import mongoose from 'mongoose';
import { env, isProd } from '@/config/env';
import { logger } from '@/lib/logger';

if (env.DNS_SERVERS) {
  const servers = env.DNS_SERVERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length) dns.setServers(servers);
}

mongoose.set('strictQuery', true);
mongoose.set('autoIndex', !isProd);
mongoose.set('sanitizeFilter', true);

let connecting: Promise<typeof mongoose> | null = null;

export async function connectDatabase(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;
  connecting = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 15_000,
      maxPoolSize: 20,
      minPoolSize: 2,
    })
    .then(async (m) => {
      logger.info({ host: m.connection.host, db: m.connection.name }, 'mongodb connected');
      // autoIndex only CREATES missing indexes — it never rebuilds one whose options changed,
      // so a corrected unique/partial definition silently never reaches a dev database and the
      // stale rule keeps rejecting writes. syncIndexes drops what no longer matches the schema.
      if (!isProd) await syncModelIndexes();
      return m;
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

/** Brings every registered model's indexes in line with its schema (development only). */
async function syncModelIndexes(): Promise<void> {
  for (const name of mongoose.modelNames()) {
    try {
      await mongoose.model(name).syncIndexes();
    } catch (err) {
      // A clash here must never stop the API booting; the log is enough to act on.
      logger.warn({ err, model: name }, 'index sync skipped');
    }
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('mongodb disconnected');
  }
}

mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb connection error'));
mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
