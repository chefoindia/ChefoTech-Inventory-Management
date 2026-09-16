import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { app, BASE, registerTenant, addMember, auth, type TestTenant } from './helpers';
import { createTabletProduct, unitIds } from './catalog.test';
import { postOpening } from './inventory.test';
import { sealSecret, openSecret, maskSecret } from '@/lib/secret-box';
import { GeminiProvider, pickClosestModel } from '@/services/ai/gemini';
import type { AiGenerateRequest, AiGenerateResult } from '@/services/ai/provider';

const key = () => `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const hdr = (t: TestTenant, token = t.accessToken) => ({ ...auth(token), 'X-Outlet-Id': t.outletId });

afterEach(() => vi.restoreAllMocks());

/** Pretend the key is valid and record what the model was asked; reply according to a script. */
function stubGemini(script: (req: AiGenerateRequest, call: number) => AiGenerateResult) {
  vi.spyOn(GeminiProvider.prototype, 'test').mockResolvedValue({ ok: true, message: 'Connected. 3 models available.', models: ['gemini-2.5-flash'] });
  let calls = 0;
  const seen: AiGenerateRequest[] = [];
  vi.spyOn(GeminiProvider.prototype, 'generate').mockImplementation(async (req) => { seen.push(req); calls += 1; return script(req, calls); });
  return seen;
}

describe('AI: key storage and settings', () => {
  it('seals secrets and only ever exposes the last four characters', () => {
    const sealed = sealSecret('AIzaSyEXAMPLEKEY1234567890ABCD');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('AIza');
    expect(openSecret(sealed)).toBe('AIzaSyEXAMPLEKEY1234567890ABCD');
    expect(maskSecret('AIzaSyEXAMPLEKEY1234567890ABCD')).toBe('••••••••••••ABCD');
  });

  it('starts disconnected, refuses chat with a friendly message, validates the key before saving, and never returns it', async () => {
    const t = await registerTenant();
    const initial = await request(app).get(`${BASE}/ai/settings`).set(hdr(t));
    expect(initial.status).toBe(200);
    expect(initial.body.data.connected).toBe(false);
    expect(initial.body.data.keyMasked).toBe('');

    const noKey = await request(app).post(`${BASE}/ai/chat`).set(hdr(t)).send({ messages: [{ role: 'user', content: 'hello' }] });
    expect(noKey.status).toBe(422);
    expect(noKey.body.error.message).toMatch(/Add your Gemini API key/);

    vi.spyOn(GeminiProvider.prototype, 'test').mockResolvedValueOnce({ ok: false, message: 'The Gemini API key was rejected.' });
    const bad = await request(app).post(`${BASE}/ai/key`).set(hdr(t)).send({ apiKey: 'AIzaSyINVALIDKEYINVALIDKEYINVALID' });
    expect(bad.status).toBe(422);
    const still = await request(app).get(`${BASE}/ai/settings`).set(hdr(t));
    expect(still.body.data.connected).toBe(false);

    stubGemini(() => ({ text: 'ok', functionCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'STOP' }));
    const good = await request(app).post(`${BASE}/ai/key`).set(hdr(t)).send({ apiKey: 'AIzaSyEXAMPLEKEY1234567890ABCD' });
    expect(good.status).toBe(200);
    expect(good.body.data.connected).toBe(true);
    expect(good.body.data.enabled).toBe(true);
    expect(good.body.data.keyMasked).toBe('••••••••••••ABCD');
    expect(JSON.stringify(good.body)).not.toContain('AIzaSy');

    const patched = await request(app).patch(`${BASE}/ai/settings`).set(hdr(t)).send({ features: ['assistant', 'help'], language: 'hinglish', monthlyTokenLimit: 5000 });
    expect(patched.body.data.features).toEqual(['assistant', 'help']);

    // A non-admin can read status (to render the assistant) but not manage the key.
    const staff = await addMember(t, 'billing_staff');
    const denied = await request(app).delete(`${BASE}/ai/key`).set(hdr(t, staff.accessToken));
    expect(denied.status).toBe(403);
    const removed = await request(app).delete(`${BASE}/ai/key`).set(hdr(t));
    expect(removed.body.data.connected).toBe(false);
    expect(removed.body.data.enabled).toBe(false);
  });
});

describe('AI: assistant uses tools through real services with the caller\'s permissions', () => {
  it('answers a stock question by calling searchMedicine and never invents numbers', async () => {
    const t = await registerTenant();
    const u = await unitIds(t);
    const p = await createTabletProduct(t, { requiresPrescription: false, schedule: 'none' });
    await postOpening(t, p.id, u.strip, 7, { batchNumber: 'B77', expiryDate: inDays(200), mrpMinor: 18_500, purchasePriceMinor: 13_200 });

    const seen = stubGemini((req, call) => {
      if (call === 1) return { text: '', functionCalls: [{ name: 'searchMedicine', args: { query: 'montek' } }], usage: { inputTokens: 100, outputTokens: 10 }, finishReason: 'STOP' };
      // second call receives the tool result; echo the stock so the test can assert the loop wiring
      const last = req.messages[req.messages.length - 1]!;
      const part = last.parts.find((x) => 'functionResponse' in x) as unknown as { functionResponse: { response: { result: { name: string; stockBase: number }[] } } };
      const hit = part.functionResponse.response.result[0]!;
      return { text: `${hit.name} ka stock ${hit.stockBase} tablets hai.`, functionCalls: [], usage: { inputTokens: 200, outputTokens: 20 }, finishReason: 'STOP' };
    });
    await request(app).post(`${BASE}/ai/key`).set(hdr(t)).send({ apiKey: 'AIzaSyEXAMPLEKEY1234567890ABCD' });

    const res = await request(app).post(`${BASE}/ai/chat`).set(hdr(t)).send({ messages: [{ role: 'user', content: 'bhai montek ka stock kitna hai?' }], context: { page: '/inventory' } });
    expect(res.status).toBe(200);
    expect(res.body.data.reply).toBe('Montek LC ka stock 70 tablets hai.');
    expect(res.body.data.toolsUsed).toEqual(['searchMedicine']);
    expect(res.body.data.usage.inputTokens).toBe(300);
    // the model saw the page context and the tool catalogue, never the database
    expect(seen[0]!.system).toContain('Current page: /inventory');
    expect(seen[0]!.tools!.some((d) => d.name === 'searchMedicine')).toBe(true);

    const settings = await request(app).get(`${BASE}/ai/settings`).set(hdr(t));
    expect(settings.body.data.usage.requests).toBe(1);
    expect(settings.body.data.usage.inputTokens).toBe(300);
  });

  it('hides tools the user lacks permission for and proposes payments as confirmations, not actions', async () => {
    const t = await registerTenant();
    stubGemini((req, call) => {
      if (call === 1) return { text: '', functionCalls: [{ name: 'proposePayment', args: { partyType: 'customer', partyId: 'x', amount: 500 } }, { name: 'runReport', args: { reportKey: 'finance.profit' } }], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'STOP' };
      return { text: 'done', functionCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'STOP' };
    });
    await request(app).post(`${BASE}/ai/key`).set(hdr(t)).send({ apiKey: 'AIzaSyEXAMPLEKEY1234567890ABCD' });
    const cust = await request(app).post(`${BASE}/customers`).set(auth(t.accessToken)).send({ name: 'Rahul', phone: '9000000002' });

    // Billing staff: can collect payments but cannot see profit reports.
    const staff = await addMember(t, 'billing_staff');
    const declared = await request(app).post(`${BASE}/ai/chat`).set(hdr(t, staff.accessToken)).send({ messages: [{ role: 'user', content: 'Rahul se 500 le lo' }] });
    expect(declared.status).toBe(200);
    // proposePayment ran against a bogus id and failed gracefully inside the loop; runReport was not offered to this role
    expect(declared.body.data.reply).toBe('done');

    // Owner with a real customer id: a confirmation action comes back, nothing is recorded.
    vi.restoreAllMocks();
    stubGemini((req, call) => {
      if (call === 1) return { text: '', functionCalls: [{ name: 'proposePayment', args: { partyType: 'customer', partyId: cust.body.data.id, amount: 500, method: 'upi' } }], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'STOP' };
      return { text: 'Confirm karo to record ho jayega.', functionCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'STOP' };
    });
    const owner = await request(app).post(`${BASE}/ai/chat`).set(hdr(t)).send({ messages: [{ role: 'user', content: 'Rahul se 500 UPI le lo' }] });
    expect(owner.status).toBe(200);
    const action = owner.body.data.actions.find((a: { type: string }) => a.type === 'confirmPayment');
    expect(action).toMatchObject({ partyType: 'customer', partyId: cust.body.data.id, amountMinor: 50_000, method: 'upi' });
    const after = await request(app).get(`${BASE}/customers/${cust.body.data.id}`).set(auth(t.accessToken));
    expect(after.body.data.balanceMinor).toBe(0);
  });
});

describe('AI: model availability', () => {
  it('picks the closest model a key actually offers', () => {
    const available = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'text-embedding-004', 'gemini-2.0-flash-exp'];
    expect(pickClosestModel('gemini-2.0-flash', available)).toBe('gemini-2.0-flash');
    expect(pickClosestModel('gemini-2.5-flash', available)).toBe('gemini-2.0-flash');
    expect(pickClosestModel('gemini-2.5-flash-lite', available)).toBe('gemini-2.0-flash-lite');
    expect(pickClosestModel('gemini-2.5-pro', available)).toBe('gemini-1.5-pro');
    // Never proposes a model that cannot answer a chat request.
    expect(pickClosestModel('gemini-2.5-flash', ['text-embedding-004'])).toBeUndefined();
    expect(pickClosestModel('gemini-flash-latest', ['imagen-4.0', 'veo-3.0', 'gemini-2.5-flash-image'])).toBeUndefined();

    // Google's maintained "-latest" aliases are preferred: they are never retired.
    const modern = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-flash-lite-latest', 'gemini-pro-latest'];
    expect(pickClosestModel('gemini-9.9-flash', modern)).toBe('gemini-flash-latest');
    expect(pickClosestModel('gemini-9.9-flash-lite', modern)).toBe('gemini-flash-lite-latest');
    expect(pickClosestModel('gemini-9.9-pro', modern)).toBe('gemini-pro-latest');
  });

  it('echoes the thought signature back so tool calling works on Gemini 3 models', async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] }] }), { status: 200 });
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      bodies.push(body);
      // First turn: ask for a tool, with the opaque signature Gemini 3 attaches to the call.
      if (bodies.length === 1) {
        return new Response(JSON.stringify({
          candidates: [{ content: { parts: [{ functionCall: { name: 'listReports', args: {} }, thoughtSignature: 'SIG-abc123' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
        }), { status: 200 });
      }
      // Second turn: Google rejects the history if the signature did not come back.
      const contents = body.contents as { role: string; parts: Record<string, unknown>[] }[];
      const modelTurn = contents.find((c) => c.role === 'model');
      const call = modelTurn?.parts.find((p) => 'functionCall' in p);
      if (!call || call.thoughtSignature !== 'SIG-abc123') {
        return new Response(JSON.stringify({ error: { code: 400, message: 'Function call is missing a thought_signature in functionCall parts.' } }), { status: 400 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'Two customers owe money.' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 },
      }), { status: 200 });
    });

    const provider = new GeminiProvider('AIzaSyEXAMPLEKEY1234567890ABCD');
    const first = await provider.generate({ model: 'gemini-3.6-flash', system: 'test', messages: [{ role: 'user', parts: [{ text: 'Which customers have pending payments?' }] }], tools: [{ name: 'listReports', description: 'reports', parameters: { type: 'object', properties: {} } }] });
    expect(first.functionCalls[0]!.thoughtSignature).toBe('SIG-abc123');

    // Replaying the call the way the chat loop does must not lose the signature.
    const second = await provider.generate({
      model: 'gemini-3.6-flash',
      system: 'test',
      messages: [
        { role: 'user', parts: [{ text: 'Which customers have pending payments?' }] },
        { role: 'model', parts: first.functionCalls.map((c) => ({ functionCall: c })) },
        { role: 'user', parts: [{ functionResponse: { name: 'listReports', response: { result: [] } } }] },
      ],
      tools: [{ name: 'listReports', description: 'reports', parameters: { type: 'object', properties: {} } }],
    });
    expect(second.text).toBe('Two customers owe money.');
  });

  it('moves off a model Google has retired, using the replacement Google names', async () => {
    const urls: string[] = [];
    const ok = { candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      urls.push(url.replace(/key=[^&]+/, 'key=***'));
      // The retired model is still listed by ListModels: being listed is not proof it can be called.
      if (url.includes('/models?')) {
        return new Response(JSON.stringify({ models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
        ] }), { status: 200 });
      }
      if (url.includes('gemini-2.5-flash:generateContent')) {
        return new Response(JSON.stringify({ error: { code: 404, message: 'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.' } }), { status: 404 });
      }
      return new Response(JSON.stringify(ok), { status: 200 });
    });

    const provider = new GeminiProvider('AIzaSyEXAMPLEKEY1234567890ABCD');
    const res = await provider.generate({ model: 'gemini-2.5-flash', system: 'test', messages: [{ role: 'user', parts: [{ text: 'hi' }] }] });
    expect(res.text).toBe('OK');
    expect(res.modelUsed).toBe('gemini-3.6-flash');
    expect(urls.some((u) => u.includes('gemini-3.6-flash:generateContent'))).toBe(true);
    expect(urls.every((u) => !u.includes('AIza'))).toBe(true);

    // The substitution is remembered, so the retired model is not tried again.
    const before = urls.length;
    await provider.generate({ model: 'gemini-2.5-flash', system: 'test', messages: [{ role: 'user', parts: [{ text: 'again' }] }] });
    expect(urls.slice(before).some((u) => u.includes('gemini-2.5-flash:generateContent'))).toBe(false);
  });

  it('stores the models the key reports and moves an unsupported configured model onto one that works', async () => {
    const t = await registerTenant();
    vi.spyOn(GeminiProvider.prototype, 'test').mockResolvedValue({ ok: true, message: 'Connected. 2 chat models available.', models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite'] });
    const saved = await request(app).post(`${BASE}/ai/key`).set(hdr(t)).send({ apiKey: 'AIzaSyEXAMPLEKEY1234567890ABCD' });
    expect(saved.status, saved.text).toBe(200);
    expect(saved.body.data.availableModels).toEqual(['gemini-2.0-flash', 'gemini-2.0-flash-lite']);
    // The defaults (gemini-2.5-*) are not in this key's list, so they are snapped to what is.
    expect(saved.body.data.model).toBe('gemini-2.0-flash');
    expect(saved.body.data.liteModel).toBe('gemini-2.0-flash-lite');

    // An admin may still choose any id their key supports.
    const patched = await request(app).patch(`${BASE}/ai/settings`).set(hdr(t)).send({ model: 'gemini-2.0-flash-lite' });
    expect(patched.status, patched.text).toBe(200);
    expect(patched.body.data.model).toBe('gemini-2.0-flash-lite');
  });
});
