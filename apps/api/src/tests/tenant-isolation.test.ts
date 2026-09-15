import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth } from './helpers';

/**
 * Organization A must never be able to read or mutate organization B's records,
 * even when it knows B's ids.
 */
describe('tenant isolation', () => {
  it('hides other organizations outlets, roles, members and audit logs', async () => {
    const a = await registerTenant({ organizationName: 'Org A' });
    const b = await registerTenant({ organizationName: 'Org B' });

    // Outlets: B's outlet is invisible to A by id and in lists.
    const byId = await request(app).get(`${BASE}/outlets/${b.outletId}`).set(auth(a.accessToken));
    expect(byId.status).toBe(404);
    const list = await request(app).get(`${BASE}/outlets`).set(auth(a.accessToken));
    expect(list.body.data.map((o: { id: string }) => o.id)).not.toContain(b.outletId);

    // Roles.
    const bRoles = await request(app).get(`${BASE}/roles`).set(auth(b.accessToken));
    const bRoleId = bRoles.body.data[1].id;
    expect((await request(app).get(`${BASE}/roles/${bRoleId}`).set(auth(a.accessToken))).status).toBe(404);
    expect(
      (await request(app).patch(`${BASE}/roles/${bRoleId}`).set(auth(a.accessToken)).send({ description: 'hacked' })).status,
    ).toBe(404);

    // Members.
    const aMembers = await request(app).get(`${BASE}/users`).set(auth(a.accessToken));
    expect(aMembers.body.data).toHaveLength(1);
    expect(aMembers.body.data[0].user.email).toBe(a.email);

    const bMembers = await request(app).get(`${BASE}/users`).set(auth(b.accessToken));
    const bMembershipId = bMembers.body.data[0].id;
    expect(
      (await request(app).patch(`${BASE}/users/${bMembershipId}`).set(auth(a.accessToken)).send({ status: 'suspended' })).status,
    ).toBe(404);

    // Audit logs.
    const aAudit = await request(app).get(`${BASE}/audit-logs`).set(auth(a.accessToken));
    expect(aAudit.status).toBe(200);
    for (const log of aAudit.body.data) expect(log.user?.email ?? a.email).toBe(a.email);
  });

  it('rejects X-Outlet-Id pointing at another organization outlet', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const res = await request(app).get(`${BASE}/organization`).set(auth(a.accessToken)).set('X-Outlet-Id', b.outletId);
    expect(res.status).toBe(403);
  });

  it('cannot update or archive another organization outlet', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const upd = await request(app).patch(`${BASE}/outlets/${b.outletId}`).set(auth(a.accessToken)).send({ name: 'Hijacked' });
    expect(upd.status).toBe(404);
    const arch = await request(app).post(`${BASE}/outlets/${b.outletId}/archive`).set(auth(a.accessToken));
    expect(arch.status).toBe(404);

    const check = await request(app).get(`${BASE}/outlets/${b.outletId}`).set(auth(b.accessToken));
    expect(check.body.data.name).not.toBe('Hijacked');
    expect(check.body.data.status).toBe('active');
  });

  it('cannot switch to an organization the user is not a member of', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const res = await request(app)
      .post(`${BASE}/auth/switch-organization`)
      .set(auth(a.accessToken))
      .send({ organizationId: b.organizationId });
    expect(res.status).toBe(403);
  });

  it('cannot assign a role from another organization when inviting', async () => {
    const a = await registerTenant();
    const b = await registerTenant();
    const bRoles = await request(app).get(`${BASE}/roles`).set(auth(b.accessToken));
    const bRole = bRoles.body.data.find((r: { key: string }) => r.key === 'pharmacist');
    const res = await request(app)
      .post(`${BASE}/users/invite`)
      .set(auth(a.accessToken))
      .send({ email: 'x@example.com', name: 'X Y', roleId: bRole.id, outletAccess: { all: true, outletIds: [] } });
    expect(res.status).toBe(404);
  });
});
