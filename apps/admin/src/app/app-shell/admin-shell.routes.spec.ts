import { routes } from './admin-shell.routes';

describe('admin data-transfer routes', () => {
  const shell = routes.find((route) => route.path === '');
  const childRoutes = shell?.children ?? [];

  it('keeps the global new-tree page and scoped operation lazy', () => {
    const globalRoute = childRoutes.find((route) => route.path === 'data-transfer');
    const scopedRoute = childRoutes.find((route) => route.path === 'data-transfer/:kind/:targetId');

    expect(globalRoute?.data?.['id']).toBe('data-transfer');
    expect(scopedRoute?.data?.['id']).toBe('data-transfer');
    expect(globalRoute?.loadComponent).toBeTypeOf('function');
    expect(scopedRoute?.loadComponent).toBeTypeOf('function');
    expect(scopedRoute?.canDeactivate).toHaveLength(1);
  });
});
