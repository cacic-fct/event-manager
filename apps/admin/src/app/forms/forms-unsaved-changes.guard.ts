import { CanDeactivateFn } from '@angular/router';
import type { FormsPageComponent } from './forms-page.component';

/** Confirms before leaving the form editor when its semantic editor state changed. */
export const formsUnsavedChangesGuard: CanDeactivateFn<FormsPageComponent> = (component, _route, _state, nextState) =>
  component.canDeactivate(nextState?.url);
