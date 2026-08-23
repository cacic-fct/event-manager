export type PermissionRelationValidity = {
  validFrom: Date | null;
  validUntil: Date | null;
  unlimited: boolean;
};

export function normalizePermissionRelationValidity(
  value: Partial<PermissionRelationValidity> | null | undefined,
): PermissionRelationValidity {
  const validUntil = value?.validUntil ?? null;
  return {
    validFrom: value?.validFrom ?? null,
    validUntil,
    unlimited: value?.unlimited ?? validUntil === null,
  };
}

export function unionPermissionRelationValidity(
  left: PermissionRelationValidity,
  right: PermissionRelationValidity,
): PermissionRelationValidity {
  return {
    validFrom:
      left.validFrom === null || right.validFrom === null
        ? null
        : new Date(Math.min(left.validFrom.getTime(), right.validFrom.getTime())),
    validUntil:
      left.validUntil === null || right.validUntil === null
        ? null
        : new Date(Math.max(left.validUntil.getTime(), right.validUntil.getTime())),
    unlimited: left.unlimited || right.unlimited,
  };
}

export function permissionRelationValiditiesOverlapOrTouch(
  left: PermissionRelationValidity,
  right: PermissionRelationValidity,
): boolean {
  const leftStartsBeforeRightEnds =
    left.validFrom === null || right.validUntil === null || left.validFrom <= right.validUntil;
  const rightStartsBeforeLeftEnds =
    right.validFrom === null || left.validUntil === null || right.validFrom <= left.validUntil;

  return leftStartsBeforeRightEnds && rightStartsBeforeLeftEnds;
}

export function intersectPermissionRelationValidity(
  value: PermissionRelationValidity,
  container: PermissionRelationValidity,
): PermissionRelationValidity | null {
  const validFrom =
    value.validFrom === null
      ? container.validFrom
      : container.validFrom === null
        ? value.validFrom
        : new Date(Math.max(value.validFrom.getTime(), container.validFrom.getTime()));
  const validUntil =
    value.validUntil === null
      ? container.validUntil
      : container.validUntil === null
        ? value.validUntil
        : new Date(Math.min(value.validUntil.getTime(), container.validUntil.getTime()));

  if (validFrom !== null && validUntil !== null && validFrom >= validUntil) {
    return null;
  }

  return {
    validFrom,
    validUntil,
    unlimited: validUntil === null,
  };
}

export function permissionRelationScopeKey(scope: {
  scope: string;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
}): string {
  return `${scope}:${scope.eventId ?? scope.majorEventId ?? scope.eventGroupId ?? 'GLOBAL'}`;
}
