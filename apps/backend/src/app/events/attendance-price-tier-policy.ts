import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AttendancePriceTierInput = {
  majorEventId?: string | null;
  regularAttendancePriceTierIds?: string[] | null;
};

export async function validateAttendancePriceTiers(
  tx: Prisma.TransactionClient,
  input: AttendancePriceTierInput,
  existing?: AttendancePriceTierInput,
): Promise<void> {
  if (input.regularAttendancePriceTierIds === undefined && input.majorEventId === undefined) return;
  if (input.regularAttendancePriceTierIds === null) {
    throw new BadRequestException('Informe uma lista de faixas de preço; use uma lista vazia para aceitar todas.');
  }
  const ids = input.regularAttendancePriceTierIds ?? existing?.regularAttendancePriceTierIds ?? [];
  if (!ids.length) return;
  const majorEventId = input.majorEventId === undefined ? existing?.majorEventId : input.majorEventId;
  if (!majorEventId) {
    throw new BadRequestException('Vincule o evento a um grande evento para selecionar faixas de preço.');
  }
  const tiers = await tx.priceTier.findMany({
    where: { id: { in: ids }, price: { majorEventId } },
    select: { id: true },
  });
  if (tiers.length !== new Set(ids).size) {
    throw new BadRequestException('Selecione apenas faixas de preço do grande evento vinculado.');
  }
}

export function normalizeAttendancePriceTier(name: string | null | undefined): string | null {
  return name?.trim().toLocaleLowerCase('pt-BR') || null;
}

export function attendancePriceTierPolicyChanged(
  input: AttendancePriceTierInput,
  existing: AttendancePriceTierInput,
): boolean {
  if (input.majorEventId !== undefined && input.majorEventId !== existing.majorEventId) return true;
  if (input.regularAttendancePriceTierIds === undefined) return false;
  const next = [...new Set(input.regularAttendancePriceTierIds ?? [])].sort();
  const previous = [...new Set(existing.regularAttendancePriceTierIds ?? [])].sort();
  return JSON.stringify(next) !== JSON.stringify(previous);
}
