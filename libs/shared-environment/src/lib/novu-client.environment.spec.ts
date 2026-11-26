import { novuClientEnvironment, type NovuClientEnvironment } from './novu-client.environment';

describe('Novu client environment', () => {
  it('provides the browser notification identifiers expected by shared notification components', () => {
    const environment: NovuClientEnvironment = novuClientEnvironment;

    expect(environment).toEqual({
      applicationIdentifier: 'Y0zEsN2VyO8G',
    });
  });
});
