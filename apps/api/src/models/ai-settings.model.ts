import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

/** Per-organization AI configuration. The Gemini key is stored sealed (AES-GCM) and never returned. */
const aiSettingsSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    sealedApiKey: { type: String, default: '' },
    keyLast4: { type: String, default: '' },
    keyAddedAt: { type: Date, default: null },
    lastTestedAt: { type: Date, default: null },
    lastTestOk: { type: Boolean, default: null },
    lastTestMessage: { type: String, default: '' },
    /** Chat models the key listed at the last successful test; drives the Settings dropdown. */
    availableModels: { type: [String], default: [] },
    features: { type: [String], default: ['assistant', 'invoiceReading', 'smartInventory', 'reports', 'help', 'automation', 'voiceInput'] },
    model: { type: String, default: 'gemini-2.5-flash' },
    liteModel: { type: String, default: 'gemini-2.5-flash-lite' },
    temperature: { type: Number, default: 0.2 },
    maxOutputTokens: { type: Number, default: 2048 },
    timeoutMs: { type: Number, default: 45_000 },
    monthlyTokenLimit: { type: Number, default: 0 },
    language: { type: String, default: 'auto' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, toJSON: jsonOptions },
);

export type AiSettingsDoc = InferSchemaType<typeof aiSettingsSchema> & { _id: Types.ObjectId };
export const AiSettingsModel = model('AiSettings', aiSettingsSchema);

/** One row per model call: enough for cost tracking and limits, no conversation content. */
const aiUsageSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    feature: { type: String, required: true },
    model: { type: String, required: true },
    inputTokens: { type: Number, default: 0 },
    outputTokens: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    ok: { type: Boolean, default: true },
    error: { type: String, default: '' },
    toolsUsed: { type: [String], default: [] },
  },
  { timestamps: true },
);
aiUsageSchema.index({ organizationId: 1, createdAt: -1 });
aiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 400 });

export type AiUsageDoc = InferSchemaType<typeof aiUsageSchema> & { _id: Types.ObjectId };
export const AiUsageModel = model('AiUsage', aiUsageSchema);
