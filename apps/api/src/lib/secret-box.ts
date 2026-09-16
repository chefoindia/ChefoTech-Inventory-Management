import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@/config/env';

/**
 * AES-256-GCM for small secrets stored at rest (third-party API keys). The data key is derived from
 * AI_ENCRYPTION_KEY (falling back to the JWT secret) so nothing usable ever sits in the database.
 * Format: v1.<iv b64>.<tag b64>.<ciphertext b64>
 */
function dataKey(): Buffer {
  return createHash('sha256').update(env.AI_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET).digest();
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function openSecret(sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised sealed secret');
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** "••••••••••••ABCD" — never more than the last four characters. */
export function maskSecret(plain: string): string {
  return `${'•'.repeat(12)}${plain.slice(-4)}`;
}
