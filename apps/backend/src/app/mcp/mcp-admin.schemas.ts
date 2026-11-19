import { MCP_ADMIN_CAPABILITIES } from '@cacic-fct/event-manager-mcp-contracts';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const mcpIdSchema = z.string().uuid();
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
    .max(3)
    .refine((capabilities) => new Set(capabilities).size === capabilities.length),
  expiresAt: z.iso.datetime({ offset: true }),
  maxProposals: z.number().int().min(1).max(20),
});

export const mcpDecisionSchema = z.strictObject({
  decision: z.enum(['APPROVE', 'REJECT']),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
});

export const mcpEventToolSchema = z.strictObject({
  delegationId: mcpIdSchema,
  eventId: mcpIdSchema,
});

export const mcpDescriptionProposalSchema = mcpEventToolSchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  description: z.string().trim().min(1).max(20000),
  idempotencyKey: mcpIdSchema,
});

export function parseMcpInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException('Dados MCP inválidos. Confira os campos e os limites permitidos.');
  }
  return result.data;
}
