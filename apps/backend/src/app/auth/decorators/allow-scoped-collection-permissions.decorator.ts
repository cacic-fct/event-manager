import { SetMetadata } from '@nestjs/common';
import { ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY } from '../auth.constants';

export const AllowScopedCollectionPermissions = () =>
  SetMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, true);
