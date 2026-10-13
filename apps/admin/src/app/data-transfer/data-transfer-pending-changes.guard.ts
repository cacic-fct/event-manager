import { CanDeactivateFn } from '@angular/router';

type DataTransferPendingState = { canDeactivate(): Promise<boolean> };

export const dataTransferPendingChangesGuard: CanDeactivateFn<DataTransferPendingState> = (component) =>
  component.canDeactivate();
