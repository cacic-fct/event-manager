import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { PendingPermissionChangesService } from './pending-permission-changes.service';

export const pendingPermissionChangesGuard: CanDeactivateFn<unknown> = () => {
  const pending = inject(PendingPermissionChangesService);
  return pending.dirty() ? !pending.blockNavigation() : true;
};
