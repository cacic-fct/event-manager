import { z } from 'zod';

const certificateFieldMetadataSchema = z.strictObject({
  label: z.string().trim().min(1),
  type: z.enum(['string', 'number', 'date']),
  required: z.boolean(),
  default: z.union([z.string(), z.number()]).optional(),
});

export const certificateTemplateMetadataSchema = z.strictObject({
  $schema: z.string().trim().min(1).optional(),
  key: z.string().regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  html: z.string().trim().min(1),
  css: z.string().trim().min(1).optional(),
  font: z.enum(['inter-variable']).optional(),
  isActive: z.boolean().optional(),
  certificateFields: z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), certificateFieldMetadataSchema).optional(),
});

export type CertificateTemplateMetadata = z.infer<typeof certificateTemplateMetadataSchema>;

export const certificateTemplateMetadataJsonSchema = z.toJSONSchema(certificateTemplateMetadataSchema);
