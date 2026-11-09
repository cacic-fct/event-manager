import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NavigationError, NavigationStart, Router } from '@angular/router';
import { filter, take, takeUntil } from 'rxjs';

const chunkLoadFailure =
  /^(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed)\b/i;

export function offerChunkLoadRetry(event: NavigationError): void {
  if (
    !isPlatformBrowser(inject(PLATFORM_ID)) ||
    !(event.error instanceof Error) ||
    (event.error.name !== 'ChunkLoadError' && !chunkLoadFailure.test(event.error.message))
  ) {
    return;
  }

  const router = inject(Router);
  const navigationStarted = router.events.pipe(
    filter((next) => next instanceof NavigationStart),
    take(1),
  );
  const notice = inject(MatSnackBar).open('Não foi possível abrir a página.', 'Tentar novamente');

  notice
    .onAction()
    .pipe(takeUntil(navigationStarted))
    .subscribe(() => {
      // Use the router so the current page's unsaved-change guards still run.
      void router.navigateByUrl(event.url).catch(() => undefined);
    });
  navigationStarted.pipe(takeUntil(notice.afterDismissed())).subscribe(() => notice.dismiss());
}
