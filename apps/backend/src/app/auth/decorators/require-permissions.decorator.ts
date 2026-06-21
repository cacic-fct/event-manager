import { Permission } from '@cacic-fct/shared-permissions';
import { SetMetadata } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from '../auth.constants';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
