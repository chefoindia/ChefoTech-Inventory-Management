/** Idempotency keys for financial submissions; stable per attempt, regenerated after success. */
export function newIdempotencyKey(prefix = 'k'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${rnd}`.replace(/[^A-Za-z0-9-_]/g, '').slice(0, 64);
}
