import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '@/app';
import type { MeDto } from '@pharmaos/shared';

export const app: Express = createApp();
export const BASE = '/api/v1';

let counter = 0;

export interface TestTenant {
  accessToken: string;
  refreshCookie: string;
  me: MeDto;
  email: string;
  password: string;
  organizationId: string;
  outletId: string;
}

export function extractRefreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const rt = cookies.find((c) => c.startsWith('pharmaos_rt='));
  return rt ? rt.split(';')[0]! : '';
}

export async function registerTenant(overrides: Partial<{ organizationName: string; email: string; password: string; stateCode: string }> = {}): Promise<TestTenant> {
  counter += 1;
  const email = overrides.email ?? `owner${counter}-${Date.now()}@example.com`;
  const password = overrides.password ?? 'StrongPassw0rd!';
  const res = await request(app)
    .post(`${BASE}/auth/register`)
    .send({
      organizationName: overrides.organizationName ?? `Pharmacy ${counter}`,
      ownerName: `Owner ${counter}`,
      email,
      password,
      stateCode: overrides.stateCode ?? '27',
    });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = res.body.data.me as MeDto;
  return {
    accessToken: res.body.data.accessToken,
    refreshCookie: extractRefreshCookie(res),
    me,
    email,
    password,
    organizationId: me.organization.id,
    outletId: me.outlets[0]!.id,
  };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Invite + accept a member with a given role key; returns their access token. */
export async function addMember(owner: TestTenant, roleKey: string, outletAccess: { all: boolean; outletIds: string[] } = { all: true, outletIds: [] }) {
  const rolesRes = await request(app).get(`${BASE}/roles`).set(auth(owner.accessToken));
  const role = (rolesRes.body.data as { id: string; key: string }[]).find((r) => r.key === roleKey);
  if (!role) throw new Error(`role ${roleKey} not found`);

  counter += 1;
  const email = `member${counter}-${Date.now()}@example.com`;
  const inviteRes = await request(app)
    .post(`${BASE}/users/invite`)
    .set(auth(owner.accessToken))
    .send({ email, name: `Member ${counter}`, roleId: role.id, outletAccess });
  if (inviteRes.status !== 201) throw new Error(`invite failed: ${JSON.stringify(inviteRes.body)}`);

  // Pull the raw token from the console email provider.
  const { emailProvider } = await import('@/services/email/email.service');
  const sent = (emailProvider as unknown as { sent: { to: { email: string }[]; text?: string }[] }).sent;
  const mail = [...sent].reverse().find((m) => m.to[0]?.email === email);
  const token = mail?.text?.match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error('invite token not found in email');

  const password = 'MemberPassw0rd!';
  const acceptRes = await request(app).post(`${BASE}/users/invitations/accept`).send({ token, password });
  if (acceptRes.status !== 200) throw new Error(`accept failed: ${JSON.stringify(acceptRes.body)}`);

  const loginRes = await request(app).post(`${BASE}/auth/login`).send({ email, password, organizationId: owner.organizationId });
  if (loginRes.status !== 200) throw new Error(`member login failed: ${JSON.stringify(loginRes.body)}`);
  return { accessToken: loginRes.body.data.accessToken as string, me: loginRes.body.data.me as MeDto, email, password, roleId: role.id };
}
