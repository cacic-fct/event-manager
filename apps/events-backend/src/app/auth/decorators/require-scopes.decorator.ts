import { SetMetadata } from '@nestjs/common';
import { REQUIRED_ROLES_KEY } from '../auth.constants';

export const RequireScopes = (...roles: string[]) =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
