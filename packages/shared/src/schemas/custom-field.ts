import { z } from 'zod';

export const CUSTOM_FIELD_ENTITIES = ['product', 'customer', 'supplier', 'user', 'sale', 'purchase'] as const;
export type CustomFieldEntity = (typeof CUSTOM_FIELD_ENTITIES)[number];

export const CUSTOM_FIELD_TYPES = [
  'text',
  'longText',
  'number',
  'decimal',
  'date',
  'datetime',
  'boolean',
  'dropdown',
  'multiSelect',
  'email',
  'phone',
  'url',
  'file',
  'image',
] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const customFieldOptionSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.string().trim().min(1).max(60),
});

export const createCustomFieldSchema = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES),
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,40}$/, 'Lowercase letters, numbers and underscores, starting with a letter'),
  label: z.string().trim().min(1).max(80),
  type: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  options: z.array(customFieldOptionSchema).max(100).default([]),
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      maxLength: z.number().int().min(1).max(5000).optional(),
      pattern: z.string().max(200).optional(),
    })
    .optional(),
  visibility: z
    .object({
      list: z.boolean().default(false),
      form: z.boolean().default(true),
      print: z.boolean().default(false),
    })
    .default({ list: false, form: true, print: false }),
  sortOrder: z.number().int().min(0).default(0),
  helpText: z.string().trim().max(200).optional().default(''),
});
export type CreateCustomFieldInput = z.infer<typeof createCustomFieldSchema>;

export const updateCustomFieldSchema = createCustomFieldSchema.omit({ entity: true, key: true }).partial().extend({
  status: z.enum(['active', 'archived']).optional(),
});
export type UpdateCustomFieldInput = z.infer<typeof updateCustomFieldSchema>;
