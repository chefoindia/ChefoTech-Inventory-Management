import { z } from 'zod';
import { objectIdSchema } from './common';
import { attachmentRefSchema } from './attachment';

/* ---------------------------------------------------------------- settings */

export const AI_FEATURES = ['assistant', 'invoiceReading', 'smartInventory', 'reports', 'help', 'automation', 'voiceInput'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_FEATURE_LABELS: Record<AiFeature, { label: string; description: string }> = {
  assistant: { label: 'AI Assistant', description: 'The chat assistant available on every page; answers questions about your data and prepares work for you to confirm.' },
  invoiceReading: { label: 'Invoice reading', description: 'Upload a supplier invoice photo or PDF and get a purchase draft with products, batches, expiry and prices to review.' },
  smartInventory: { label: 'Smart inventory', description: 'Reorder suggestions, expiry and slow-stock analysis in plain language.' },
  reports: { label: 'AI reports', description: 'Ask for reports in everyday words; the assistant runs the real report and explains it.' },
  help: { label: 'AI help', description: '“What is this?” explanations on screens and fields, in simple English, Hindi or Hinglish.' },
  automation: { label: 'AI automation', description: 'Prepare sale, purchase, return and payment drafts from natural language. Money and stock never move without your confirmation.' },
  voiceInput: { label: 'Voice input', description: 'Speak to the assistant instead of typing (browser support required).' },
};

export const AI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro'] as const;
export type AiModel = (typeof AI_MODELS)[number];

export const aiSettingsPatchSchema = z.object({
  enabled: z.boolean().optional(),
  features: z.array(z.enum(AI_FEATURES)).optional(),
  model: z.enum(AI_MODELS).optional(),
  /** Cheaper model for help/explanations and short lookups. */
  liteModel: z.enum(AI_MODELS).optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(256).max(8192).optional(),
  timeoutMs: z.number().int().min(5_000).max(120_000).optional(),
  /** 0 = unlimited. Requests are refused once the month's total tokens pass this. */
  monthlyTokenLimit: z.number().int().min(0).optional(),
  /** Preferred reply language hint. */
  language: z.enum(['auto', 'en', 'hi', 'hinglish']).optional(),
});
export type AiSettingsPatch = z.infer<typeof aiSettingsPatchSchema>;

export const aiApiKeySchema = z.object({ apiKey: z.string().trim().min(20).max(200) });

export interface AiSettingsDto {
  enabled: boolean;
  connected: boolean;
  /** e.g. "••••••••••••ABCD"; empty when no key is stored. */
  keyMasked: string;
  keyAddedAt: string | null;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  features: AiFeature[];
  model: AiModel;
  liteModel: AiModel;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  monthlyTokenLimit: number;
  language: 'auto' | 'en' | 'hi' | 'hinglish';
  usage: { month: string; requests: number; inputTokens: number; outputTokens: number; limitReached: boolean };
}

/* ---------------------------------------------------------------- chat */

export const aiChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
});

export const aiChatSchema = z.object({
  messages: z.array(aiChatMessageSchema).min(1).max(20),
  /** What the user is looking at; sent as context, never the whole database. */
  context: z
    .object({
      page: z.string().max(120).optional(),
      title: z.string().max(120).optional(),
      entityType: z.string().max(40).optional(),
      entityId: objectIdSchema.optional(),
      field: z.string().max(80).optional(),
      /** Small, already-visible facts the page wants the assistant to know (e.g. cart lines). */
      facts: z.record(z.string().max(60), z.union([z.string().max(300), z.number(), z.boolean()])).optional(),
    })
    .optional(),
  /** Attachments already uploaded through /attachments (invoice photo, prescription). */
  attachments: z.array(attachmentRefSchema).max(3).default([]),
});
export type AiChatInput = z.infer<typeof aiChatSchema>;

/** Buttons the assistant returns; the UI executes them through the normal app flows. */
export type AiAction =
  | { type: 'navigate'; label: string; href: string }
  | { type: 'openSaleDraft'; label: string; draft: unknown }
  | { type: 'openPurchaseDraft'; label: string; draft: unknown }
  | { type: 'openPrescriptionDraft'; label: string; draft: unknown }
  | { type: 'confirmPayment'; label: string; partyType: 'customer' | 'supplier'; partyId: string; partyName: string; amountMinor: number; method: string; note?: string }
  | { type: 'confirmEmail'; label: string; documentType: string; refId: string; to: string; refNumber: string }
  | { type: 'openReport'; label: string; reportKey: string; from?: string; to?: string }
  | { type: 'openDocument'; label: string; documentType: string; refId: string };

export interface AiChatReply {
  reply: string;
  actions: AiAction[];
  /** Tools the model called this turn, for transparency ("Checked stock for Montek LC"). */
  toolsUsed: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiExtractedPurchaseLine {
  rawName: string;
  productId: string | null;
  productName: string | null;
  /** Catalogue details for the matched product so the purchase form can prefill units and tax without another lookup. */
  product: { name: string; packLabel: string; units: { unitId: string; unitName: string; abbreviation: string; factorToBase: number; isDefaultSale: boolean; isDefaultPurchase: boolean; allowLooseSale: boolean }[]; pricingUnitId: string; baseUnitId: string; taxRateBps: number; cessBps: number; mrpMinor: number; sellingPriceMinor: number } | null;
  candidates: { id: string; name: string; packLabel: string }[];
  qty: number | null;
  freeQty: number | null;
  batchNumber: string | null;
  expiryDate: string | null;
  mrpMinor: number | null;
  purchasePriceMinor: number | null;
  taxRateBps: number | null;
  discountBps: number | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

export interface AiExtractedInvoice {
  supplierName: string | null;
  supplierGstin: string | null;
  supplierId: string | null;
  supplierCandidates: { id: string; name: string }[];
  invoiceNumber: string | null;
  invoiceDate: string | null;
  lines: AiExtractedPurchaseLine[];
  grandTotalMinor: number | null;
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiExtractedPrescription {
  doctorName: string | null;
  doctorRegNo: string | null;
  hospital: string | null;
  prescriptionDate: string | null;
  diagnosis: string | null;
  items: { medicine: string; dosage: string; duration: string; productId: string | null; candidates: { id: string; name: string }[]; confidence: 'high' | 'medium' | 'low' }[];
  warnings: string[];
  usage: { inputTokens: number; outputTokens: number };
}

export const aiExtractSchema = z.object({ attachment: attachmentRefSchema, supplierId: objectIdSchema.optional() });
