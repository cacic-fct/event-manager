import { HttpErrorResponse } from '@angular/common/http';
import { Injector, Service, inject } from '@angular/core';
import { GraphqlStatusError, RouteErrorService } from '@cacic-fct/shared-angular/errors';

/** Convert a denied or missing private route resource into the same not-found response. */
@Service()
export class AdminRouteResourceErrorService {
  private readonly injector = inject(Injector);

  redirectIfUnavailable(error: unknown): boolean {
    const status = error instanceof HttpErrorResponse || error instanceof GraphqlStatusError
      ? error.status
      : undefined;
    if (status !== 403 && status !== 404) {
      return false;
    }

    this.redirectNotFound();
    return true;
  }

  redirectNotFound(): void {
    void this.injector.get(RouteErrorService).navigate(404).catch(() => undefined);
  }
}
