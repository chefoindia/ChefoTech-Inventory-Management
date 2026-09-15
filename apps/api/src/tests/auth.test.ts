import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, extractRefreshCookie } from './helpers';

describe('auth', () => {
  it('registers an organization with owner, default outlet and system roles', async () => {
    const t = await registerTenant({ organizationName: 'Apollo Care' });
    expect(t.me.organization.name).toBe('Apollo Care');
    expect(t.me.organization.slug).toBe('apollo-care');
    expect(t.me.membership.isOwner).toBe(true);
    expect(t.me.membership.role.key).toBe('owner');
    expect(t.me.outlets).toHaveLength(1);
    expect(t.me.outlets[0]!.code).toBe('MAIN');
    expect(t.me.outlets[0]!.isDefault).toBe(true);
    expect(t.me.permissions.length).toBeGreaterThan(50);
    expect(t.refreshCookie).toMatch(/^pharmaos_rt=/);

    const roles = await request(app).get(`${BASE}/roles`).set(auth(t.accessToken));
    expect(roles.status).toBe(200);
    expect(roles.body.data.map((r: { key: string }) => r.key)).toEqual(
      expect.arrayContaining(['owner', 'org_admin', 'pharmacist', 'billing_staff', 'accountant']),
    );
  });

  it('rejects duplicate email registration and weak passwords', async () => {
    const t = await registerTenant();
    const dup = await request(app).post(`${BASE}/auth/register`).send({
      organizationName: 'Other', ownerName: 'X Y', email: t.email, password: 'StrongPassw0rd!', stateCode: '27',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    const weak = await request(app).post(`${BASE}/auth/register`).send({
      organizationName: 'Other', ownerName: 'X Y', email: 'weak@example.com', password: 'short', stateCode: '27',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    expect(weak.body.error.details[0].path).toBe('body.password');
  });

  it('logs in, returns me, and never exposes password hashes', async () => {
    const t = await registerTenant();
    const res = await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: t.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('scrypt$');

    const me = await request(app).get(`${BASE}/auth/me`).set(auth(res.body.data.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(t.email);
    expect(me.body.data.organizations).toHaveLength(1);
  });

  it('rejects wrong password with a generic message and locks after 5 failures', async () => {
    const t = await registerTenant();
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: 'wrong-password-1' });
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Incorrect email or password');
    }
    const locked = await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: t.password });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('gives the same error for unknown email as for wrong password', async () => {
    const res = await request(app).post(`${BASE}/auth/login`).send({ email: 'nobody@example.com', password: 'whatever-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const t = await registerTenant();
    const first = await request(app).post(`${BASE}/auth/refresh`).set('Cookie', t.refreshCookie);
    expect(first.status).toBe(200);
    const secondCookie = extractRefreshCookie(first);
    expect(secondCookie).not.toBe(t.refreshCookie);

    // New token works.
    const second = await request(app).post(`${BASE}/auth/refresh`).set('Cookie', secondCookie);
    expect(second.status).toBe(200);
    const thirdCookie = extractRefreshCookie(second);

    // Replaying the already-rotated token revokes the whole session family.
    const reuse = await request(app).post(`${BASE}/auth/refresh`).set('Cookie', secondCookie);
    expect(reuse.status).toBe(401);
    const afterReuse = await request(app).post(`${BASE}/auth/refresh`).set('Cookie', thirdCookie);
    expect(afterReuse.status).toBe(401);

    // Access token for the revoked session is rejected too.
    const me = await request(app).get(`${BASE}/auth/me`).set(auth(second.body.data.accessToken));
    expect(me.status).toBe(401);
  });

  it('logs out and invalidates the session', async () => {
    const t = await registerTenant();
    const out = await request(app).post(`${BASE}/auth/logout`).set(auth(t.accessToken)).set('Cookie', t.refreshCookie);
    expect(out.status).toBe(204);
    const me = await request(app).get(`${BASE}/auth/me`).set(auth(t.accessToken));
    expect(me.status).toBe(401);
    const refresh = await request(app).post(`${BASE}/auth/refresh`).set('Cookie', t.refreshCookie);
    expect(refresh.status).toBe(401);
  });

  it('changes password and signs out other sessions', async () => {
    const t = await registerTenant();
    const other = await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: t.password });
    const otherToken = other.body.data.accessToken as string;

    const change = await request(app)
      .post(`${BASE}/auth/change-password`)
      .set(auth(t.accessToken))
      .send({ currentPassword: t.password, newPassword: 'AnotherStr0ngPass!' });
    expect(change.status).toBe(204);

    expect((await request(app).get(`${BASE}/auth/me`).set(auth(t.accessToken))).status).toBe(200);
    expect((await request(app).get(`${BASE}/auth/me`).set(auth(otherToken))).status).toBe(401);

    const login = await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: 'AnotherStr0ngPass!' });
    expect(login.status).toBe(200);
  });

  it('lists and revokes sessions', async () => {
    const t = await registerTenant();
    await request(app).post(`${BASE}/auth/login`).send({ email: t.email, password: t.password });
    const list = await request(app).get(`${BASE}/auth/sessions`).set(auth(t.accessToken));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);
    const otherSession = list.body.data.find((s: { current: boolean }) => !s.current);
    const revoke = await request(app).delete(`${BASE}/auth/sessions/${otherSession.id}`).set(auth(t.accessToken));
    expect(revoke.status).toBe(204);
    const after = await request(app).get(`${BASE}/auth/sessions`).set(auth(t.accessToken));
    expect(after.body.data).toHaveLength(1);
  });

  it('rejects requests without a token, with a malformed token, and with injection keys', async () => {
    expect((await request(app).get(`${BASE}/auth/me`)).status).toBe(401);
    expect((await request(app).get(`${BASE}/auth/me`).set(auth('not-a-jwt'))).status).toBe(401);
    const inj = await request(app).post(`${BASE}/auth/login`).send({ email: { $gt: '' }, password: 'x' });
    expect(inj.status).toBe(400);
  });
});
