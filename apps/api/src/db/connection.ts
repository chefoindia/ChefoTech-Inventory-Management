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
    .then((m) => {
      logger.info({ host: m.connection.host, db: m.connection.name }, 'mongodb connected');
      return m;
    })
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('mongodb disconnected');
  }
}

mongoose.connection.on('error', (err) => logger.error({ err }, 'mongodb connection error'));
mongoose.connection.on('disconnected', () => logger.warn('mongodb disconnected'));
