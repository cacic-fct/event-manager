import { ConflictException } from '@nestjs/common';

export function assertTicketConfigVersionUnchanged(
  expected: { id: string; updatedAt: Date } | null,
  current: { id: string; updatedAt: Date } | null,
): void {
  if (
    Boolean(current) !== Boolean(expected) ||
    (current && expected && (
      current.id !== expected.id || current.updatedAt.getTime() !== expected.updatedAt.getTime()
    ))
  ) {
    throw new ConflictException('A configuração foi alterada por outra operação. Atualize e tente novamente.');
  }
}
