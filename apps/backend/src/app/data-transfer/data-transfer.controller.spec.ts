import 'reflect-metadata';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY,
  EMPTY_SCOPED_PERMISSION_CONTEXT_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from '../auth/auth.constants';
import { DataTransferController } from './data-transfer.controller';

describe('DataTransferController collection authorization', () => {
  it.each(['preview', 'apply'] as const)(
    '%s uses an empty controller scope and leaves mixed-scope row checks to the service',
    (handlerName) => {
      const handler = DataTransferController.prototype[handlerName];

      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, handler)).toEqual([Permission.DataTransfer.Import]);
      expect(Reflect.getMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(EMPTY_SCOPED_PERMISSION_CONTEXT_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, handler)).toBeUndefined();
    },
  );
});
