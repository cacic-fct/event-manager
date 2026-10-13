import { Permission } from '@cacic-fct/shared-permissions';
import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY,
  EMPTY_SCOPED_PERMISSION_CONTEXT_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../auth.constants';

/** Authorizes collection access without interpreting nested row IDs as one shared scope. */
export const RequireCollectionPermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions),
    SetMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, true),
    SetMetadata(EMPTY_SCOPED_PERMISSION_CONTEXT_KEY, true),
  );
