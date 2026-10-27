import { BadRequestException } from '@nestjs/common';

export interface EventLocationInput {
  locationName?: string | null;
  locationDescription?: string | null;
  locationInternalNotes?: string | null;
  isVirtual?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

/** Keep limits at the write boundary, including draft application and legacy clients. */
export function normalizeEventLocation<T extends EventLocationInput>(input: T): T {
  const result = { ...input };
  for (const [field, limit] of [
    ['locationName', 250],
    ['locationDescription', 2000],
    ['locationInternalNotes', 10000],
  ] as const) {
    const value = input[field];
    if (value !== undefined) {
      if (value !== null && typeof value !== 'string') throw new BadRequestException('Local inválido.');
      if (value && value.length > limit) throw new BadRequestException(`O campo de local excede ${limit} caracteres.`);
      Object.assign(result, { [field]: value?.trim() || null });
    }
  }
  if (input.isVirtual === true) {
    Object.assign(result, { locationName: null, locationDescription: null, latitude: null, longitude: null });
  }
  return result;
}

/** Validate the complete location, merging saved values before checking a partial update. */
export function assertEventLocation(input: EventLocationInput, current: EventLocationInput = {}): void {
  const location = {
    ...current,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)),
  };
  if (location.isVirtual) return;
  const hasPhysicalLocation =
    Boolean(location.locationDescription?.trim()) || location.latitude != null || location.longitude != null;
  if (hasPhysicalLocation && !location.locationName?.trim()) {
    throw new BadRequestException('Informe o nome do local ao preencher a descrição ou as coordenadas.');
  }
}
