import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiMessage, type AiProvider } from './provider';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
  if (status === 404) return new AiProviderError('UNAVAILABLE', 'The configured Gemini model is not available for this key.');
  if (status >= 500) return new AiProviderError('UNAVAILABLE', 'Gemini is temporarily unavailable.');
  return new AiProviderError('BAD_RESPONSE', `Gemini returned an unexpected response (${status}).`);
}

/** Google Gemini via the REST API; the key never leaves the server. */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
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

  async test(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    const res = await this.call('/models?pageSize=50', { method: 'GET' }, 15_000);
    if (!res.ok) {
      const err = mapHttpError(res.status, await res.text());
      return { ok: false, message: err.message };
    }
    const body = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    const models = (body.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    return { ok: true, message: `Connected. ${models.length} models available.`, models };
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

    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      res = await this.call(`/models/${req.model}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, req.timeoutMs ?? 45_000);
      if (res.status === 429 || res.status === 503) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      break;
    }
    if (!res) throw new AiProviderError('UNAVAILABLE', 'Gemini is temporarily unavailable.');
    if (!res.ok) throw mapHttpError(res.status, await res.text());

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
    };
  }
}
