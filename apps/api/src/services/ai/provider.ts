/**
 * Provider-agnostic LLM interface. Gemini is the first implementation; anything that can take a
 * system prompt, a message history, tool declarations and inline files can be plugged in later
 * without touching the pharmacy services or the tool layer.
 */
export interface AiToolDeclaration {
  name: string;
  description: string;
  /** JSON-schema-like parameters (OpenAPI subset understood by Gemini). */
  parameters: Record<string, unknown>;
}

export interface AiInlineFile {
  mimeType: string;
  /** Base64 content. */
  data: string;
}

/**
 * A call the model asked for. `thoughtSignature` is an opaque token some models (Gemini 3 and
 * later) attach to the call: it must be sent back untouched with the same part on the next turn,
 * or the API refuses the request. Treat it as a cookie for the model's own reasoning.
 */
export interface AiFunctionCall {
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
}

export type AiPart = { text: string } | { file: AiInlineFile } | { functionCall: AiFunctionCall } | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface AiMessage {
  role: 'user' | 'model';
  parts: AiPart[];
}

export interface AiGenerateRequest {
  model: string;
  system: string;
  messages: AiMessage[];
  tools?: AiToolDeclaration[];
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** Force a JSON reply that matches this schema (extraction tasks). */
  responseSchema?: Record<string, unknown>;
}

export interface AiGenerateResult {
  text: string;
  functionCalls: AiFunctionCall[];
  usage: { inputTokens: number; outputTokens: number };
  finishReason: string;
  /** The model that actually answered; differs from the request when the configured one was unavailable. */
  modelUsed?: string;
}

export interface AiProvider {
  readonly name: string;
  generate(req: AiGenerateRequest): Promise<AiGenerateResult>;
  /** Cheap connectivity/key check. */
  test(): Promise<{ ok: boolean; message: string; models?: string[] }>;
  /** Models this key may actually call, newest-capable first. Used to validate the configured model. */
  listModels?(): Promise<string[]>;
}

/** Errors the UI can explain in plain words; `code` never carries provider internals. */
export class AiProviderError extends Error {
  constructor(
    readonly code: 'INVALID_KEY' | 'QUOTA' | 'RATE_LIMIT' | 'TIMEOUT' | 'UNAVAILABLE' | 'BAD_RESPONSE' | 'BLOCKED',
    message: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}
