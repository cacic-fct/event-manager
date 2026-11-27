import {
  MCP_ADMIN_CAPABILITIES,
  MCP_EVENT_REVIEW_FIELDS,
  MCP_PROPOSAL_OPERATIONS,
  type McpEventReviewSelection,
} from '@cacic-fct/event-manager-mcp-contracts';
import { z } from 'zod';
import { mcpReviewTokenSchemaPattern } from './shared/review-token';
import { mcpIdSchema } from './shared/schemas';

export const mcpDelegationInputSchema = z.strictObject({
  clientId: z.string().trim().min(1).max(200),
  eventIds: z
    .array(mcpIdSchema)
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  capabilities: z
    .array(z.enum(MCP_ADMIN_CAPABILITIES))
    .min(1)
    .max(MCP_ADMIN_CAPABILITIES.length)
    .refine((capabilities) => new Set(capabilities).size === capabilities.length),
  expiresAt: z.iso.datetime({ offset: true }),
  maxProposals: z.number().int().min(1).max(20),
});

const mcpReviewTextFields = MCP_EVENT_REVIEW_FIELDS.filter(
  (field) => field !== 'isVirtual' && field !== 'latitude' && field !== 'longitude' && field !== 'name',
);
const mcpReviewSelectionSchema = z.union([
  z.strictObject({ field: z.literal('isVirtual'), value: z.boolean().optional() }),
  z.strictObject({ field: z.enum(['latitude', 'longitude']), value: z.number().nullable().optional() }),
  z.strictObject({ field: z.literal('name'), value: z.string().optional() }),
  z.strictObject({ field: z.enum(mcpReviewTextFields), value: z.string().nullable().optional() }),
]) satisfies z.ZodType<McpEventReviewSelection>;

const mcpReviewSelectionsSchema = z
  .array(mcpReviewSelectionSchema)
  .min(1)
  .max(MCP_EVENT_REVIEW_FIELDS.length)
  .refine((selections) => new Set(selections.map(({ field }) => field)).size === selections.length);

export const mcpEventReviewSchema = z.strictObject({
  expectedOperation: z.enum(MCP_PROPOSAL_OPERATIONS),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  selections: mcpReviewSelectionsSchema,
});

export const mcpDecisionSchema = z
  .strictObject({
    expectedOperation: z.enum(MCP_PROPOSAL_OPERATIONS).optional(),
    decision: z.enum(['APPROVE', 'REJECT']),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    review: z
      .strictObject({ selections: mcpReviewSelectionsSchema, token: z.string().regex(mcpReviewTokenSchemaPattern) })
      .optional(),
  })
  .refine(({ review, decision, expectedOperation }) => !review || (decision === 'APPROVE' && !!expectedOperation));

export const mcpEventToolSchema = z.strictObject({
  delegationId: mcpIdSchema,
  eventId: mcpIdSchema,
});

export const mcpDescriptionProposalSchema = mcpEventToolSchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(20000),
  idempotencyKey: mcpIdSchema,
});
