import { logger } from '@/lib/logger';
import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiMessage, type AiProvider } from './provider';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Models that cannot answer a chat/tool request even though the key lists them. */
const NOT_CHAT = /embedding|aqa|imagen|veo|image|tts|audio|transcribe|lyria|robotics|computer-use|nano-banana|deep-research|antigravity|learnlm|gemma/i;

/** "…update your code to use models/gemini-3.6-flash…" — Google names the replacement itself. */
const REPLACEMENT = /use\s+models\/([a-zA-Z0-9.\-_]+)/i;

/** Google's own message, trimmed and stripped of anything key-shaped, for the operator's eyes. */
function googleMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; status?: string } };
    return (parsed.error?.message ?? '').replace(/AIza[0-9A-Za-z_-]{10,}/g, '***').slice(0, 300);
  } catch {
    return body.replace(/AIza[0-9A-Za-z_-]{10,}/g, '***').slice(0, 300);
  }
}

/**
 * Picks the closest model this key can actually call. Google renames and retires model ids over
 * time and different projects see different lists, so the configured name is treated as a
 * preference, not a guarantee.
 */
export function pickClosestModel(requested: string, available: string[]): string | undefined {
  const usable = available.filter((m) => !NOT_CHAT.test(m));
  if (!usable.length) return undefined;
  if (usable.includes(requested)) return requested;
  const wantsLite = /lite/i.test(requested);
  const wantsPro = /pro/i.test(requested);
  const score = (m: string): number => {
    let s = 0;
    if (/lite/i.test(m) === wantsLite) s += 30;
    if (/pro/i.test(m) === wantsPro) s += 25;
    if (/flash/i.test(m) && !wantsPro) s += 15;
    // "…-latest" aliases are maintained by Google and never retired, so they are the safest default.
    if (/latest/i.test(m)) s += 26;
    const version = Number.parseFloat(/(\d+\.\d+)/.exec(m)?.[1] ?? '0');
    s += Math.min(version, 9) * 6;
    if (/(exp|preview|thinking|native|dialog)/i.test(m)) s -= 35;
    return s;
  };
  return [...usable].sort((a, b) => score(b) - score(a))[0];
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

function toGeminiContents(messages: AiMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    parts: m.parts.map((p): GeminiPart => {
      if ('text' in p) return { text: p.text };
      if ('file' in p) return { inlineData: { mimeType: p.file.mimeType, data: p.file.data } };
      if ('functionCall' in p) return { functionCall: p.functionCall };
      return { functionResponse: p.functionResponse };
    }),
  }));
}

function mapHttpError(status: number, body: string): AiProviderError {
  const lower = body.toLowerCase();
  if (status === 400 && lower.includes('api key')) return new AiProviderError('INVALID_KEY', 'The Gemini API key was rejected. Check it in Settings → AI.');
  if (status === 401 || status === 403) return new AiProviderError('INVALID_KEY', 'The Gemini API key is invalid or has no access to this model.');
  if (status === 429) return new AiProviderError(lower.includes('quota') ? 'QUOTA' : 'RATE_LIMIT', lower.includes('quota') ? 'The Gemini quota for this key is used up.' : 'Gemini is rate-limiting requests; try again in a moment.');
  if (status === 404) return new AiProviderError('UNAVAILABLE', 'The configured Gemini model is not available for this key. Open Settings → AI & Gemini and pick one of the models your key lists.');
  if (status >= 500) return new AiProviderError('UNAVAILABLE', 'Gemini is temporarily unavailable.');
  const detail = googleMessage(body);
  return new AiProviderError('BAD_RESPONSE', detail ? `Gemini rejected the request: ${detail}` : `Gemini returned an unexpected response (${status}).`);
}

/** Google Gemini via the REST API; the key never leaves the server. */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  /** Model ids this key can call, fetched once per instance. */
  private models: string[] | null = null;
  /** Configured id → id that actually worked, so a fallback is resolved once per instance. */
  private readonly resolved = new Map<string, string>();
  /** Ids this key lists but cannot actually call (retired for new users, wrong API version…). */
  private readonly unusable = new Set<string>();
  constructor(private readonly apiKey: string) {}

  private async call(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(this.apiKey)}`, { ...init, signal: controller.signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw new AiProviderError('TIMEOUT', 'Gemini took too long to answer.');
      throw new AiProviderError('UNAVAILABLE', 'Could not reach Gemini. Check the server\'s internet connection.');
    } finally {
      clearTimeout(timer);
    }
  }

  /** Chat-capable models this key may call. Cached for the life of the instance. */
  async listModels(): Promise<string[]> {
    if (this.models) return this.models;
    const res = await this.call('/models?pageSize=200', { method: 'GET' }, 15_000);
    if (!res.ok) throw mapHttpError(res.status, await res.text());
    const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    this.models = (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((m) => !NOT_CHAT.test(m));
    return this.models;
  }

  async test(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    try {
      const models = await this.listModels();
      if (!models.length) return { ok: false, message: 'The key works but lists no chat models. Enable the Gemini API for this key in Google AI Studio.' };
      return { ok: true, message: `Connected. ${models.length} chat models available, including ${models.slice(0, 3).join(', ')}.`, models };
    } catch (err) {
      return { ok: false, message: err instanceof AiProviderError ? err.message : 'Could not reach Gemini.' };
    }
  }

  async generate(req: AiGenerateRequest): Promise<AiGenerateResult> {
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: toGeminiContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxOutputTokens ?? 2048,
        ...(req.responseSchema ? { responseMimeType: 'application/json', responseSchema: req.responseSchema } : {}),
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    };
    if (req.tools?.length) payload.tools = [{ functionDeclarations: req.tools }];

    const send = async (model: string): Promise<Response> => {
      let out: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        out = await this.call(`/models/${model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, req.timeoutMs ?? 45_000);
        if (out.status === 429 || out.status === 503) {
          await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
          continue;
        }
        break;
      }
      if (!out) throw new AiProviderError('UNAVAILABLE', 'Gemini is temporarily unavailable.');
      return out;
    };

    let model = this.resolved.get(req.model) ?? req.model;
    let res = await send(model);

    // Google renames models, retires them for new users and still lists them, so "it is in
    // ListModels" is not proof that it can be called. On a 404 we take Google's own suggested
    // replacement when it offers one, otherwise the closest model the key lists, and try again,
    // rather than telling a pharmacy with a perfectly good key that AI is unavailable.
    for (let hop = 0; res.status === 404 && hop < 3; hop += 1) {
      const body = await res.text();
      const detail = googleMessage(body);
      this.unusable.add(model);
      let available: string[] = [];
      try {
        available = await this.listModels();
      } catch {
        throw mapHttpError(404, body);
      }
      const suggested = REPLACEMENT.exec(detail)?.[1];
      const next = suggested && !this.unusable.has(suggested) ? suggested : pickClosestModel(req.model, available.filter((m) => !this.unusable.has(m)));
      if (!next) {
        logger.warn({ model, detail }, 'gemini has no usable model left for this key');
        throw new AiProviderError('UNAVAILABLE', detail ? `Gemini refused every model this key offers. Google said: ${detail}` : `Gemini has no callable model for this key. Pick one in Settings → AI & Gemini.`);
      }
      logger.warn({ from: model, to: next, detail }, 'gemini model unavailable; switching to another model this key offers');
      model = next;
      this.resolved.set(req.model, next);
      res = await send(model);
    }

    if (!res.ok) {
      const body = await res.text();
      logger.warn({ status: res.status, model, detail: googleMessage(body) }, 'gemini request failed');
      throw mapHttpError(res.status, body);
    }

    const body = (await res.json()) as {
      candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    if (body.promptFeedback?.blockReason) throw new AiProviderError('BLOCKED', 'Gemini declined this request.');
    const cand = body.candidates?.[0];
    const parts = cand?.content?.parts ?? [];
    return {
      text: parts.map((p) => p.text ?? '').join('').trim(),
      functionCalls: parts.filter((p) => p.functionCall).map((p) => ({ name: p.functionCall!.name, args: p.functionCall!.args ?? {} })),
      usage: { inputTokens: body.usageMetadata?.promptTokenCount ?? 0, outputTokens: body.usageMetadata?.candidatesTokenCount ?? 0 },
      finishReason: cand?.finishReason ?? 'STOP',
      modelUsed: model,
    };
  }
}
