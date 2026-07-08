import { novuClientEnvironment, type NovuClientEnvironment } from './novu-client.environment';

describe('Novu client environment', () => {
  it('provides the browser notification identifiers expected by shared notification components', () => {
    const environment: NovuClientEnvironment = novuClientEnvironment;

    expect(environment).toEqual({
      applicationIdentifier: 'Y0zEsN2VyO8G',
      pushIntegrationIdentifier: 'firebase-cloud-messaging',
      vapidPublicKey: 'BFseNiVau8-ig_SoebWTjELpT4hLfenQUbhiBtY_eoUetaujttVyTJCSV0swSuSt7PrzW6yMxisF9bVKMQaZ5iI',
    });
  });
});
