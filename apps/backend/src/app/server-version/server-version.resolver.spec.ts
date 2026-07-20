import { ServerVersionResolver } from './server-version.resolver';

describe('ServerVersionResolver', () => {
  it('returns the build-time version placeholder before the image build replaces it', () => {
    expect(new ServerVersionResolver().getServerVersion()).toBe('APP_VERSION_PLACEHOLDER');
  });
});
