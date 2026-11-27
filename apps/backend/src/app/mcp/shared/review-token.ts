import { ConflictException } from '@nestjs/common';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PREVIEW_TTL_MS = 10 * 60_000;
const localSigningKey = randomBytes(32);
const tokenPattern = /^(\d{13})\.([A-Za-z0-9_-]{43})$/;

export const mcpReviewTokenSchemaPattern = tokenPattern;

export function canonicalMcpValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalMcpValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, canonicalMcpValue(item)]),
    );
  return value;
}

function signature(purpose: string, expiresAt: number, payload: unknown): Buffer {
  // Reuse the server-only key already required for production web sessions.
  const key = process.env.KEYCLOAK_CLIENT_SECRET?.trim();
  if (!key && process.env.NODE_ENV === 'production') throw new Error('MCP review signing key is unavailable.');
  return createHmac('sha256', key || localSigningKey)
    .update(JSON.stringify(['mcp-review-v1', purpose, expiresAt, canonicalMcpValue(payload)]))
    .digest();
}

export function signMcpReview(purpose: string, payload: unknown, expiresAt: Date): string {
  const now = Date.now();
  if (expiresAt.getTime() <= now) throw new ConflictException('A proposta expirou antes da confirmação.');
  const deadline = Math.min(now + PREVIEW_TTL_MS, expiresAt.getTime());
  return `${deadline}.${signature(purpose, deadline, payload).toString('base64url')}`;
}

export function assertMcpReviewToken(purpose: string, payload: unknown, token: string): void {
  const match = tokenPattern.exec(token);
  if (match) {
    const deadline = Number(match[1]);
    const received = Buffer.from(match[2], 'base64url');
    if (deadline > Date.now() && timingSafeEqual(signature(purpose, deadline, payload), received)) return;
  }
  throw new ConflictException('A confirmação mudou ou expirou. Confira novamente as alterações finais.');
}
