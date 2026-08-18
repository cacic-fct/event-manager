import { appRoutes } from './app.routes';

describe('certificate validation route wiring', () => {
  it('keeps the validation component alive while opening linked events', () => {
    const validationRoutes = appRoutes.filter((route) => route.path?.startsWith('validate'));

    expect(validationRoutes).toHaveLength(2);
    expect(validationRoutes.every((route) => route.data?.['reuseTab'] === true)).toBe(true);
  });
});
