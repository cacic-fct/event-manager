import '@angular/compiler';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NavigationError, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { offerChunkLoadRetry } from './chunk-load-recovery';

describe('offerChunkLoadRetry', () => {
  const url = '/event/123?tab=programacao#manha';
  const navigateByUrl = vi.fn().mockResolvedValue(true);
  const dismiss = vi.fn();
  const open = vi.fn();
  let action: Subject<void>;
  let dismissed: Subject<void>;
  let events: Subject<NavigationStart>;
  let injector: EnvironmentInjector;

  beforeEach(() => {
    vi.clearAllMocks();
    action = new Subject();
    dismissed = new Subject();
    events = new Subject();
    open.mockReturnValue({ onAction: () => action, afterDismissed: () => dismissed, dismiss });
  });

  afterEach(() => {
    action.complete();
    dismissed.complete();
    events.complete();
    injector.destroy();
  });

  function report(error: Error, platform = 'browser'): void {
    injector = createEnvironmentInjector(
      [
        { provide: PLATFORM_ID, useValue: platform },
        { provide: Router, useValue: { events, navigateByUrl } },
        { provide: MatSnackBar, useValue: { open } },
      ],
      null as unknown as EnvironmentInjector,
    );
    runInInjectionContext(injector, () => offerChunkLoadRetry(new NavigationError(1, url, error)));
  }

  it.each([
    new TypeError('Failed to fetch dynamically imported module: https://example.test/app/chunk-ABC.js'),
    new TypeError('error loading dynamically imported module: https://example.test/app/chunk-ABC.js'),
    new TypeError('Importing a module script failed.'),
    Object.assign(new Error('Loading chunk 1 failed.'), { name: 'ChunkLoadError' }),
  ])('offers a router retry for %s', (error) => {
    report(error);

    expect(open).toHaveBeenCalledWith('Não foi possível abrir a página.', 'Tentar novamente');
    expect(navigateByUrl).not.toHaveBeenCalled();

    action.next();

    expect(navigateByUrl).toHaveBeenCalledWith(url);
  });

  it('dismisses the retry when the user starts another navigation', () => {
    report(new TypeError('Importing a module script failed.'));

    events.next(new NavigationStart(2, '/'));
    action.next();

    expect(dismiss).toHaveBeenCalledOnce();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });

  it('leaves unrelated router failures alone', () => {
    report(new TypeError('Failed to fetch'));

    expect(open).not.toHaveBeenCalled();
  });

  it('does not offer a retry on the server', () => {
    report(new TypeError('Importing a module script failed.'), 'server');

    expect(open).not.toHaveBeenCalled();
  });
});
