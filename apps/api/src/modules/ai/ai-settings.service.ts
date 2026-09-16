import type { Types } from 'mongoose';
import type { AiSettingsDto, AiSettingsPatch, AiFeature } from '@pharmaos/shared';
import { AiSettingsModel, AiUsageModel, type AiSettingsDoc } from '@/models/ai-settings.model';
import type { RequestContext } from '@/lib/context';
import { BusinessRuleError } from '@/lib/errors';
import { sealSecret, openSecret, maskSecret } from '@/lib/secret-box';
import { audit } from '@/services/audit.service';
import { GeminiProvider, pickClosestModel } from '@/services/ai/gemini';
import type { AiProvider } from '@/services/ai/provider';

async function ensureDoc(organizationId: Types.ObjectId): Promise<AiSettingsDoc> {
  const existing = await AiSettingsModel.findOne({ organizationId }).lean<AiSettingsDoc>();
  if (existing) return existing;
  await AiSettingsModel.updateOne({ organizationId }, { $setOnInsert: { organizationId } }, { upsert: true });
  return (await AiSettingsModel.findOne({ organizationId }).lean<AiSettingsDoc>())!;
}

export async function monthlyUsage(organizationId: Types.ObjectId) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const [row] = await AiUsageModel.aggregate<{ requests: number; inputTokens: number; outputTokens: number }>([
    { $match: { organizationId, createdAt: { $gte: start } } },
    { $group: { _id: null, requests: { $sum: 1 }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' } } },
  ]);
  return { month: start.toISOString().slice(0, 7), requests: row?.requests ?? 0, inputTokens: row?.inputTokens ?? 0, outputTokens: row?.outputTokens ?? 0 };
}

/**
 * Keeps the configured model ids callable: if the key does not offer the stored id (Google renames
 * and retires them, and each project sees a different list), snap to the closest one it does offer.
 */
function modelsFor(available: string[] | undefined, model?: string, liteModel?: string): Record<string, string> {
  if (!available?.length) return {};
  const out: Record<string, string> = {};
  const main = pickClosestModel(model || 'gemini-flash-latest', available);
  const lite = pickClosestModel(liteModel || 'gemini-flash-lite-latest', available);
  if (main && main !== model) out.model = main;
  if (lite && lite !== liteModel) out.liteModel = lite;
  return out;
}

export async function toDto(doc: AiSettingsDoc): Promise<AiSettingsDto> {
  const usage = await monthlyUsage(doc.organizationId);
  const limit = doc.monthlyTokenLimit ?? 0;
  return {
    enabled: doc.enabled ?? false,
    connected: Boolean(doc.sealedApiKey) && (doc.lastTestOk ?? false),
    keyMasked: doc.keyLast4 ? maskSecret(`xxxx${doc.keyLast4}`) : '',
    keyAddedAt: doc.keyAddedAt ? new Date(doc.keyAddedAt).toISOString() : null,
    lastTestedAt: doc.lastTestedAt ? new Date(doc.lastTestedAt).toISOString() : null,
    lastTestOk: doc.lastTestOk ?? null,
    lastTestMessage: doc.lastTestMessage ?? '',
    features: (doc.features ?? []) as AiFeature[],
    model: doc.model ?? 'gemini-flash-latest',
    liteModel: doc.liteModel ?? 'gemini-flash-lite-latest',
    availableModels: doc.availableModels ?? [],
    temperature: doc.temperature ?? 0.2,
    maxOutputTokens: doc.maxOutputTokens ?? 2048,
    timeoutMs: doc.timeoutMs ?? 45_000,
    monthlyTokenLimit: limit,
    language: (doc.language ?? 'auto') as AiSettingsDto['language'],
    usage: { ...usage, limitReached: limit > 0 && usage.inputTokens + usage.outputTokens >= limit },
  };
}

/** Persists a model the provider had to substitute, so later requests skip the failed one. */
export async function rememberModel(organizationId: Types.ObjectId, field: 'model' | 'liteModel', value: string): Promise<void> {
  await AiSettingsModel.updateOne({ organizationId }, { $set: { [field]: value } });
}

export async function getSettings(ctx: RequestContext): Promise<AiSettingsDto> {
  return toDto(await ensureDoc(ctx.organizationId));
}

export async function updateSettings(ctx: RequestContext, patch: AiSettingsPatch): Promise<AiSettingsDto> {
  await ensureDoc(ctx.organizationId);
  const $set: Record<string, unknown> = { updatedBy: ctx.userId };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) $set[k] = v;
  await AiSettingsModel.updateOne({ organizationId: ctx.organizationId }, { $set });
  await audit(ctx, { action: 'ai.settingsUpdated', entityType: 'AiSettings', summary: `Updated AI settings (${Object.keys(patch).join(', ')})`, after: patch });
  return getSettings(ctx);
}

/** Validates the key against Gemini before storing it sealed; a bad key is never saved. */
export async function setApiKey(ctx: RequestContext, apiKey: string): Promise<AiSettingsDto> {
  const provider = new GeminiProvider(apiKey);
  const test = await provider.test();
  if (!test.ok) throw new BusinessRuleError(test.message);
  const doc = await ensureDoc(ctx.organizationId);
  await AiSettingsModel.updateOne(
    { organizationId: ctx.organizationId },
    { $set: { sealedApiKey: sealSecret(apiKey), keyLast4: apiKey.slice(-4), keyAddedAt: new Date(), lastTestedAt: new Date(), lastTestOk: true, lastTestMessage: test.message, availableModels: test.models ?? [], enabled: true, updatedBy: ctx.userId, ...modelsFor(test.models, doc.model, doc.liteModel) } },
  );
  await audit(ctx, { action: 'ai.keyConnected', entityType: 'AiSettings', summary: `Connected a Gemini API key (…${apiKey.slice(-4)})` });
  return getSettings(ctx);
}

export async function removeApiKey(ctx: RequestContext): Promise<AiSettingsDto> {
  await AiSettingsModel.updateOne({ organizationId: ctx.organizationId }, { $set: { sealedApiKey: '', keyLast4: '', keyAddedAt: null, lastTestOk: null, lastTestMessage: '', enabled: false, updatedBy: ctx.userId } });
  await audit(ctx, { action: 'ai.keyRemoved', entityType: 'AiSettings', summary: 'Removed the Gemini API key and disabled AI' });
  return getSettings(ctx);
}

export async function testConnection(ctx: RequestContext): Promise<AiSettingsDto> {
  const doc = await ensureDoc(ctx.organizationId);
  if (!doc.sealedApiKey) throw new BusinessRuleError('No Gemini API key is stored yet.');
  const provider = new GeminiProvider(openSecret(doc.sealedApiKey));
  const test = await provider.test();
  await AiSettingsModel.updateOne(
    { organizationId: ctx.organizationId },
    { $set: { lastTestedAt: new Date(), lastTestOk: test.ok, lastTestMessage: test.message, ...(test.ok ? { availableModels: test.models ?? [], ...modelsFor(test.models, doc.model, doc.liteModel) } : {}) } },
  );
  return getSettings(ctx);
}

export interface ResolvedAi {
  provider: AiProvider;
  settings: AiSettingsDoc;
}

/** The provider for an organization, or a clear reason why AI is unavailable. */
export async function resolveAi(organizationId: Types.ObjectId, feature: AiFeature): Promise<ResolvedAi> {
  const settings = await ensureDoc(organizationId);
  if (!settings.enabled || !settings.sealedApiKey) throw new BusinessRuleError('AI features are not connected. Add your Gemini API key in Settings → AI to enable your AI assistant.');
  if (!(settings.features ?? []).includes(feature)) throw new BusinessRuleError('This AI feature is turned off in Settings → AI.');
  if ((settings.monthlyTokenLimit ?? 0) > 0) {
    const u = await monthlyUsage(organizationId);
    if (u.inputTokens + u.outputTokens >= settings.monthlyTokenLimit!) throw new BusinessRuleError('This month\'s AI usage limit has been reached. Raise the limit in Settings → AI or wait for next month.');
  }
  return { provider: new GeminiProvider(openSecret(settings.sealedApiKey)), settings };
}

export async function recordUsage(ctx: RequestContext, entry: { feature: string; model: string; inputTokens: number; outputTokens: number; durationMs: number; ok: boolean; error?: string; toolsUsed?: string[] }) {
  await AiUsageModel.create({ organizationId: ctx.organizationId, userId: ctx.userId, ...entry, error: entry.error ?? '', toolsUsed: entry.toolsUsed ?? [] }).catch(() => undefined);
}
