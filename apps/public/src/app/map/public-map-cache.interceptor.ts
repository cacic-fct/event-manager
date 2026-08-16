import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { PublicMapCacheService } from './public-map-cache.service';

export const publicMapCacheInvalidationInterceptor: HttpInterceptorFn = (request, next) => {
  const cache = inject(PublicMapCacheService);
  const query = request.body && typeof request.body === 'object' && 'query' in request.body
    ? (request.body as { query?: unknown }).query
    : null;
  const isGraphqlMutation =
    request.url.endsWith('/api/graphql') && typeof query === 'string' && /\bmutation\b/.test(query);

  return next(request).pipe(
    tap({
      next: (event) => {
        if (isGraphqlMutation && event instanceof HttpResponse) {
          cache.invalidate();
        }
      },
    }),
  );
};
