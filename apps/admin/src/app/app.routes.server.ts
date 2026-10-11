import { RenderMode, ServerRoute } from '@angular/ssr';
import type { Route } from '@angular/router';
import { PAGE_ERROR_HEADERS, type PageErrorStatus } from '@cacic-fct/shared-angular/errors';
import { routes as adminShellRoutes } from './app-shell/admin-shell.routes';
import { routes as dashboardRoutes } from './dashboard/home.routes';
import { routes as permissionRoutes } from './permissions/permissions.routes';

const errorStatuses = [403, 404, 500, 503] as const satisfies readonly PageErrorStatus[];

function routePath(route: Route, parentPath: string): string {
  const path = route.path ?? '';
  if (!path) return parentPath;
  return parentPath ? `${parentPath}/${path}` : path;
}

function lazyChildren(route: Route): Route[] | undefined {
  if (route.children) return route.children;
  if (!route.loadChildren) return undefined;

  if (route.path === '') return dashboardRoutes;
  if (route.path === 'permissions') return permissionRoutes;
  throw new Error(`Admin SSR route map is missing lazy children for ${route.path ?? '(matcher)'}.`);
}

function collectAdminClientPaths(routes: readonly Route[], parentPath = ''): string[] {
  const paths: string[] = [];

  for (const route of routes) {
    if (route.matcher) continue;

    const path = routePath(route, parentPath);
    paths.push(path);
    const children = lazyChildren(route);
    if (children) paths.push(...collectAdminClientPaths(children, path));
  }

  return paths;
}

const knownClientPaths = [...new Set([
  'login',
  '',
  ...collectAdminClientPaths(adminShellRoutes),
])];

export const serverRoutes: ServerRoute[] = [
  ...errorStatuses.map((status): ServerRoute => ({
    path: `error/${status}`,
    renderMode: RenderMode.Server,
    status,
    headers: PAGE_ERROR_HEADERS,
  })),
  ...knownClientPaths.map((path): ServerRoute => ({
    path,
    renderMode: RenderMode.Client,
  })),
  {
    path: '**',
    renderMode: RenderMode.Server,
  },
];
