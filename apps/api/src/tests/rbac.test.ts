import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, auth, addMember } from './helpers';

describe('rbac', () => {
  it('billing staff cannot manage outlets, roles or users but can read outlets', async () => {
    const owner = await registerTenant();
    const staff = await addMember(owner, 'billing_staff');

    expect(staff.me.membership.role.key).toBe('billing_staff');
    expect(staff.me.permissions).not.toContain('outlets.manage');

    const create = await request(app)
      .post(`${BASE}/outlets`)
      .set(auth(staff.accessToken))
      .send({ name: 'Branch', code: 'BR1', stateCode: '27' });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');

    expect((await request(app).get(`${BASE}/users`).set(auth(staff.accessToken))).status).toBe(403);
    expect((await request(app).get(`${BASE}/roles`).set(auth(staff.accessToken))).status).toBe(403);
    expect((await request(app).get(`${BASE}/audit-logs`).set(auth(staff.accessToken))).status).toBe(403);
    expect((await request(app).get(`${BASE}/outlets`).set(auth(staff.accessToken))).status).toBe(200);
    expect((await request(app).get(`${BASE}/auth/me`).set(auth(staff.accessToken))).status).toBe(200);
  });

  it('org admin can manage outlets and users', async () => {
    const owner = await registerTenant();
    const admin = await addMember(owner, 'org_admin');
    const create = await request(app)
      .post(`${BASE}/outlets`)
      .set(auth(admin.accessToken))
      .send({ name: 'Branch', code: 'BR1', stateCode: '27' });
    expect(create.status).toBe(201);
    expect((await request(app).get(`${BASE}/users`).set(auth(admin.accessToken))).status).toBe(200);
  });

  it('a non-owner cannot grant permissions they do not hold (escalation guard)', async () => {
    const owner = await registerTenant();
    const manager = await addMember(owner, 'outlet_manager');
    // outlet_manager has users.view but not roles.manage → cannot create roles at all.
    const res = await request(app)
      .post(`${BASE}/roles`)
      .set(auth(manager.accessToken))
      .send({ name: 'Super', permissions: ['roles.manage', 'data.export'] });
    expect(res.status).toBe(403);

    // org_admin has roles.manage but not data.export → cannot grant data.export.
    const admin = await addMember(owner, 'org_admin');
    const escalate = await request(app)
      .post(`${BASE}/roles`)
      .set(auth(admin.accessToken))
      .send({ name: 'Exporter', permissions: ['data.export'] });
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.message).toMatch(/cannot grant/);

    const fine = await request(app)
      .post(`${BASE}/roles`)
      .set(auth(admin.accessToken))
      .send({ name: 'Counter Lead', permissions: ['sales.view', 'sales.create'] });
    expect(fine.status).toBe(201);
  });

  it('nobody can assign or edit the owner role', async () => {
    const owner = await registerTenant();
    const roles = await request(app).get(`${BASE}/roles`).set(auth(owner.accessToken));
    const ownerRole = roles.body.data.find((r: { key: string }) => r.key === 'owner');
    const edit = await request(app)
      .patch(`${BASE}/roles/${ownerRole.id}`)
      .set(auth(owner.accessToken))
      .send({ permissions: ['sales.view'] });
    expect(edit.status).toBe(403);

    const invite = await request(app)
      .post(`${BASE}/users/invite`)
      .set(auth(owner.accessToken))
      .send({ email: 'z@example.com', name: 'Z Z', roleId: ownerRole.id, outletAccess: { all: true, outletIds: [] } });
    expect(invite.status).toBe(403);
  });

  it('outlet access restricts which outlets a member can select', async () => {
    const owner = await registerTenant();
    const branch = await request(app)
      .post(`${BASE}/outlets`)
      .set(auth(owner.accessToken))
      .send({ name: 'Branch', code: 'BR1', stateCode: '27' });
    const branchId = branch.body.data.id as string;

    const staff = await addMember(owner, 'billing_staff', { all: false, outletIds: [owner.outletId] });
    expect(staff.me.outlets.map((o) => o.id)).toEqual([owner.outletId]);

    const okRes = await request(app).get(`${BASE}/outlets`).set(auth(staff.accessToken)).set('X-Outlet-Id', owner.outletId);
    expect(okRes.status, JSON.stringify(okRes.body)).toBe(200);
    const denied = await request(app).get(`${BASE}/outlets`).set(auth(staff.accessToken)).set('X-Outlet-Id', branchId);
    expect(denied.status).toBe(403);
    const byId = await request(app).get(`${BASE}/outlets/${branchId}`).set(auth(staff.accessToken));
    expect(byId.status).toBe(403);
  });

  it('suspending a member revokes their sessions immediately', async () => {
    const owner = await registerTenant();
    const staff = await addMember(owner, 'billing_staff');
    const members = await request(app).get(`${BASE}/users`).set(auth(owner.accessToken));
    const staffMembership = members.body.data.find((m: { user: { email: string } }) => m.user.email === staff.email);

    const res = await request(app)
      .patch(`${BASE}/users/${staffMembership.id}`)
      .set(auth(owner.accessToken))
      .send({ status: 'suspended' });
    expect(res.status).toBe(200);
    expect((await request(app).get(`${BASE}/auth/me`).set(auth(staff.accessToken))).status).toBe(401);
    const login = await request(app).post(`${BASE}/auth/login`).send({ email: staff.email, password: staff.password });
    expect(login.status).toBe(403);
  });

  it('role permission edits apply to members on their next request', async () => {
    const owner = await registerTenant();
    const staff = await addMember(owner, 'billing_staff');
    expect((await request(app).get(`${BASE}/users`).set(auth(staff.accessToken))).status).toBe(403);

    const res = await request(app)
      .patch(`${BASE}/roles/${staff.roleId}`)
      .set(auth(owner.accessToken))
      .send({ permissions: ['users.view', 'sales.view'] });
    expect(res.status).toBe(200);
    expect((await request(app).get(`${BASE}/users`).set(auth(staff.accessToken))).status).toBe(200);
  });
});
