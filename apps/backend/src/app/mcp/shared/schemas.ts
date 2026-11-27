import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const mcpIdSchema = z.string().uuid();

export function parseMcpInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException('Dados MCP inválidos. Confira os campos e os limites permitidos.');
  }
  return result.data;
}

export function parseMcpOperationInput(
  input: unknown,
  schema: z.ZodType,
  maxBytes: number,
  isBounded?: (input: unknown) => boolean,
): Record<string, unknown> {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new BadRequestException('Argumentos inválidos ou excessivos.');
  }
  if (serialized === undefined || Buffer.byteLength(serialized) > maxBytes || (isBounded && !isBounded(input))) {
    throw new BadRequestException('Argumentos inválidos ou excessivos.');
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException('Confira os argumentos da operação.');
  }
  return parsed.data as Record<string, unknown>;
}
