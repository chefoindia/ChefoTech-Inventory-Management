import { Schema, model, type Types, type InferSchemaType } from 'mongoose';
import { jsonOptions } from './_shared';

const customFieldDefinitionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, required: true },
    entity: { type: String, required: true },
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    defaultValue: { type: Schema.Types.Mixed, default: null },
    options: { type: [new Schema({ label: String, value: String }, { _id: false })], default: [] },
    validation: {
      min: { type: Number, default: null },
      max: { type: Number, default: null },
      maxLength: { type: Number, default: null },
      pattern: { type: String, default: null },
    },
    visibility: {
      list: { type: Boolean, default: false },
      form: { type: Boolean, default: true },
      print: { type: Boolean, default: false },
    },
    sortOrder: { type: Number, default: 0 },
    helpText: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions },
);

customFieldDefinitionSchema.index({ organizationId: 1, entity: 1, key: 1 }, { unique: true });
customFieldDefinitionSchema.index({ organizationId: 1, entity: 1, status: 1, sortOrder: 1 });

export type CustomFieldDefinitionDoc = InferSchemaType<typeof customFieldDefinitionSchema> & { _id: Types.ObjectId };
export const CustomFieldDefinitionModel = model('CustomFieldDefinition', customFieldDefinitionSchema);
