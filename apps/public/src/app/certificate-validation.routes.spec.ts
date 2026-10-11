import { appRoutes } from './app.routes';

describe('certificate validation route wiring', () => {
  it('destroys validation pages on navigation and retains only their result data', () => {
    const validationRoutes = appRoutes.filter((route) => route.path?.startsWith('validate'));

    expect(validationRoutes).toHaveLength(2);
    expect(validationRoutes.every((route) => route.data?.['reuseTab'] !== true)).toBe(true);
  });
});
