import { z } from 'zod';
import { mcpIdSchema } from '../shared/schemas';
import { mcpReviewTokenSchemaPattern } from '../shared/review-token';
export const adminScopeSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('ALL_AUTHORIZED') }),
  z.strictObject({
    mode: z.literal('RESOURCE'),
    kind: z.enum(['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT']),
    id: mcpIdSchema,
  }),
]);
export const adminDelegationSchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200),
  operations: z
    .array(
      z
        .string()
        .regex(/^[_A-Za-z][_0-9A-Za-z]*$/)
        .max(150),
    )
    .min(1)
    .max(300)
    .refine((items) => new Set(items).size === items.length),
  scope: adminScopeSchema,
  personalData: z.boolean(),
  expiresAt: z.iso.datetime({ offset: true }),
  maxProposals: z.number().int().min(1).max(20),
});
export const commandReviewSchema = z.strictObject({
  arguments: z.record(z.string(), z.unknown()),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export const commandPreviewSchema = commandReviewSchema.extend({
  proposalId: mcpIdSchema,
  operation: z.string(),
  effects: z.string(),
  token: z.string().regex(mcpReviewTokenSchemaPattern),
});
export const commandDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  review: commandPreviewSchema.optional(),
});
