import { BadRequestException } from '@nestjs/common';

export function readPermissionList(rawPermissions: unknown): string[] {
  if (!Array.isArray(rawPermissions)) {
    throw new BadRequestException('permissions must be an array.');
  }

  const permissions = new Set<string>();
  for (const permission of rawPermissions) {
    if (typeof permission !== 'string') {
      throw new BadRequestException('permissions must contain only strings.');
    }

    const normalizedPermission = permission.trim();
    if (normalizedPermission) {
      permissions.add(normalizedPermission);
    }
  }

  return [...permissions];
}
