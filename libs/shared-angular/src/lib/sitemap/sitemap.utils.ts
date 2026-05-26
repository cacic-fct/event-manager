export interface RoutePathTreeNode {
  path?: string;
  children?: readonly RoutePathTreeNode[];
}

export function collectPaths(routes: readonly RoutePathTreeNode[]): string[] {
  const paths: string[] = [];

  for (const route of routes) {
    if (route.path !== undefined && route.path !== '**') {
      paths.push(route.path === '' ? '/' : route.path.startsWith('/') ? route.path : `/${route.path}`);
    }

    if (Array.isArray(route.children)) {
      paths.push(...collectPaths(route.children));
    }
  }

  return paths;
}
