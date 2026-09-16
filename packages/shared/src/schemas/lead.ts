import { z } from 'zod';

export const LEAD_TYPES = ['demo', 'contact', 'sales'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

/** Public website enquiry (demo request, sales question or general contact). */
export const createLeadSchema = z.object({
  type: z.enum(LEAD_TYPES),
  name: z.string().trim().min(2, 'Please tell us your name').max(120),
  email: z.string().trim().email('Enter a valid email address').max(200),
  phone: z.string().trim().max(20).optional().default(''),
  pharmacyName: z.string().trim().max(160).optional().default(''),
  outlets: z.string().trim().max(20).optional().default(''),
  message: z.string().trim().max(2000).optional().default(''),
  /** Where the form was submitted from (path), for context only. */
  source: z.string().trim().max(200).optional().default(''),
  /** Honeypot: real visitors never fill this. */
  website: z.string().max(0, 'Spam detected').optional().default(''),
  consent: z.boolean().refine((v) => v, 'Please agree to be contacted about your enquiry'),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export interface LeadDto {
  id: string;
  type: LeadType;
  receivedAt: string;
}
