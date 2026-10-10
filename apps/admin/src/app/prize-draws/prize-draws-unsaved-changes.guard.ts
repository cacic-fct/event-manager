import { inject } from '@angular/core';
import { Router, type CanDeactivateFn } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { PrizeDrawsPageComponent } from './prize-draws-page.component';

/** Keep the URL and editor together when browser history or a link leaves a dirty draw. */
export const prizeDrawsUnsavedChangesGuard: CanDeactivateFn<PrizeDrawsPageComponent> = (component, _route, _state, nextState) => {
  const workspace = component.workspace;
  if (!workspace.unsavedChanges()) return true;
  const next = inject(Router).parseUrl(nextState.url);
  const segments = next.root.children['primary']?.segments.map((segment) => segment.path) ?? [];
  const scope = workspace.scopeFilter();
  if (segments.length === 2 && segments[0] === 'draws' && segments[1] === workspace.selected()?.id &&
    (next.queryParams['eventId'] || undefined) === scope?.eventId &&
    (next.queryParams['majorEventId'] || undefined) === scope?.majorEventId) return true;
  inject(MatSnackBar).open('Salve ou descarte as alterações antes de sair do sorteio.', 'Fechar', { duration: 3500 });
  return false;
};
