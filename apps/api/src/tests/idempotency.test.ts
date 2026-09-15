import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerTenant, auth } from './helpers';
import { authenticate } from '@/middleware/authenticate';
import { idempotent } from '@/middleware/idempotency';
import { errorHandler } from '@/middleware/error-handler';
import { requestId } from '@/middleware/request-id';

/** Minimal app exercising the middleware the way financial endpoints will use it. */
function buildApp() {
  const app = express();
  let counter = 0;
  app.use(requestId);
  app.use(express.json());
  app.post('/create', authenticate, idempotent({ required: true }), (_req, res) => {
    counter += 1;
    res.status(201).json({ success: true, data: { counter } });
  });
  app.post('/fail', authenticate, idempotent(), (_req, res) => {
    res.status(500).json({ success: false });
  });
  app.post('/validate', authenticate, idempotent({ required: true }), (req, res) => {
    if (!req.body.doctor) return res.status(400).json({ success: false, error: { code: 'BUSINESS_RULE', message: 'doctor required' } });
    counter += 1;
    return res.status(201).json({ success: true, data: { counter } });
  });
  app.use(errorHandler);
  return app;
}

describe('idempotency middleware', () => {
  it('requires a key when configured, replays identical requests, rejects mismatches', async () => {
    const t = await registerTenant();
    const app = buildApp();

    const missing = await request(app).post('/create').set(auth(t.accessToken)).send({ a: 1 });
    expect(missing.status).toBe(400);

    const key = 'order-1234-abcd';
    const first = await request(app).post('/create').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ a: 1 });
    expect(first.status).toBe(201);
    expect(first.body.data.counter).toBe(1);

    const replay = await request(app).post('/create').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ a: 1 });
    expect(replay.status).toBe(201);
    expect(replay.body.data.counter).toBe(1);
    expect(replay.headers['idempotent-replayed']).toBe('true');

    const mismatch = await request(app).post('/create').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ a: 2 });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_MISMATCH');

    // Keys are per organization: another tenant can reuse the same string.
    const other = await registerTenant();
    const otherFirst = await request(app).post('/create').set(auth(other.accessToken)).set('Idempotency-Key', key).send({ a: 1 });
    expect(otherFirst.status).toBe(201);
    expect(otherFirst.body.data.counter).toBe(2);
  });

  it('does not store server failures so the client can retry with the same key', async () => {
    const t = await registerTenant();
    const app = buildApp();
    const key = 'retry-key-0001';
    const fail = await request(app).post('/fail').set(auth(t.accessToken)).set('Idempotency-Key', key).send({});
    expect(fail.status).toBe(500);
    // A retry should be processed again (not replayed / not conflict).
    const retry = await request(app).post('/fail').set(auth(t.accessToken)).set('Idempotency-Key', key).send({});
    expect(retry.status).toBe(500);
    expect(retry.headers['idempotent-replayed']).toBeUndefined();
  });

  it('releases the key after a 4xx so a corrected request can reuse it', async () => {
    const t = await registerTenant();
    const app = buildApp();
    const key = 'fix-and-retry-01';
    const refused = await request(app).post('/validate').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ qty: 1 });
    expect(refused.status).toBe(400);
    // Different body, same key: accepted because the failed attempt created nothing.
    const fixed = await request(app).post('/validate').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ qty: 1, doctor: 'Dr Mehta' });
    expect(fixed.status).toBe(201);
    // And the successful one is now sticky: a replay returns the stored response, a change is a mismatch.
    const replay = await request(app).post('/validate').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ qty: 1, doctor: 'Dr Mehta' });
    expect(replay.headers['idempotent-replayed']).toBe('true');
    const mismatch = await request(app).post('/validate').set(auth(t.accessToken)).set('Idempotency-Key', key).send({ qty: 2, doctor: 'Dr Mehta' });
    expect(mismatch.status).toBe(422);
  });
});
