import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app, BASE } from './helpers';
import { LeadModel } from '@/models/lead.model';
import { emailProvider, ConsoleEmailProvider } from '@/services/email/email.service';
import { env } from '@/config/env';

describe('public website leads', () => {
  beforeAll(() => {
    env.LEADS_NOTIFY_EMAIL = 'sales@example.com';
  });

  it('stores a demo request and notifies the configured inbox with reply-to set to the visitor', async () => {
    const res = await request(app).post(`${BASE}/leads`).send({ type: 'demo', name: 'Priya Sharma', email: 'Priya@Example.com', phone: '+91 98765 43210', pharmacyName: 'Sharma Medicals', outlets: '2', message: 'Would like a demo next week.', source: '/demo', consent: true });
    expect(res.status, res.text).toBe(201);
    expect(res.body.data.type).toBe('demo');
    const lead = await LeadModel.findById(res.body.data.id);
    expect(lead?.email).toBe('priya@example.com');
    expect(lead?.notified).toBe(true);
    const sent = (emailProvider as ConsoleEmailProvider).sent;
    const mail = sent[sent.length - 1]!;
    expect(mail.to[0]!.email).toBe('sales@example.com');
    expect(mail.replyTo?.email).toBe('Priya@Example.com');
    expect(mail.subject).toContain('Demo request');
    expect(mail.text).toContain('Sharma Medicals');
  });

  it('rejects the honeypot, missing consent and bad emails', async () => {
    const spam = await request(app).post(`${BASE}/leads`).send({ type: 'contact', name: 'Bot', email: 'bot@example.com', website: 'http://spam', consent: true });
    expect(spam.status).toBe(400);
    const noConsent = await request(app).post(`${BASE}/leads`).send({ type: 'contact', name: 'Real Person', email: 'real@example.com', consent: false });
    expect(noConsent.status).toBe(400);
    const badEmail = await request(app).post(`${BASE}/leads`).send({ type: 'sales', name: 'Real Person', email: 'not-an-email', consent: true });
    expect(badEmail.status).toBe(400);
  });

  it('still stores the lead when no notification inbox is configured', async () => {
    env.LEADS_NOTIFY_EMAIL = undefined;
    const res = await request(app).post(`${BASE}/leads`).send({ type: 'contact', name: 'Arun', email: 'arun@example.com', message: 'Hi', consent: true });
    expect(res.status).toBe(201);
    const lead = await LeadModel.findById(res.body.data.id);
    expect(lead?.notified).toBe(false);
  });
});
