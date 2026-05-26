import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function readArray(record: Record<string, Prisma.JsonValue>, key: string): Prisma.JsonArray {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ConflictException(`Invalid ${key} payload.`);
  }
  return value;
}

export function readStringArray(record: Record<string, Prisma.JsonValue>, key: string): string[] {
  return readArray(record, key).map((entry) => {
    if (typeof entry !== 'string') {
      throw new ConflictException(`Invalid ${key} payload entry.`);
    }
    return entry;
  });
}

export function readRequiredString(record: Record<string, Prisma.JsonValue>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new ConflictException(`Invalid ${key} payload value.`);
  }
  return value;
}

export function readNullableString(record: Record<string, Prisma.JsonValue>, key: string): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new ConflictException(`Invalid ${key} payload value.`);
  }
  return value;
}

export function isRecord(value: Prisma.JsonValue): value is Record<string, Prisma.JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
