import { BadRequestException } from '@nestjs/common';

const DEFAULT_TAKE = 50;
const MAX_TAKE = 1000;
const MAX_SKIP = 10_000;

export function resolvePagination(skip?: number, take?: number): { skip: number; take: number } {
  if ((skip !== undefined && !Number.isInteger(skip)) || (take !== undefined && !Number.isInteger(take))) {
    throw new BadRequestException('Pagination values must be integers.');
  }

  if (skip !== undefined && skip > MAX_SKIP) {
    throw new BadRequestException(`Pagination skip must be less than or equal to ${MAX_SKIP}.`);
  }

  return {
    skip: Math.max(0, skip ?? 0),
    take: Math.min(MAX_TAKE, Math.max(0, take ?? DEFAULT_TAKE)),
  };
}
