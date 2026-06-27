import Typesense from 'typesense';
import { buildTypesenseClient, buildTypesenseNodeConfigFromUrl } from './typesense-search.client';

jest.mock('typesense', () => ({
  __esModule: true,
  default: {
    Client: jest.fn(),
  },
}));

const typesenseClientConstructor = Typesense.Client as unknown as jest.Mock;

describe('typesense search client helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('parses http and https node URLs', () => {
    const logger = { warn: jest.fn() };

    expect(buildTypesenseNodeConfigFromUrl('https://search.example.com', logger as never)).toEqual({
      host: 'search.example.com',
      port: 443,
      protocol: 'https',
    });
    expect(buildTypesenseNodeConfigFromUrl('http://search.example.com:8108', logger as never)).toEqual({
      host: 'search.example.com',
      port: 8108,
      protocol: 'http',
    });
  });

  it('rejects missing, invalid, and unsupported URLs', () => {
    const logger = { warn: jest.fn() };

    expect(buildTypesenseNodeConfigFromUrl('', logger as never)).toBeNull();
    expect(buildTypesenseNodeConfigFromUrl('not a url', logger as never)).toBeNull();
    expect(buildTypesenseNodeConfigFromUrl('postgresql://search.example.com', logger as never)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Typesense URL is invalid.');
    expect(logger.warn).toHaveBeenCalledWith('Typesense URL protocol must be http or https.');
  });

  it('builds a Typesense client only when enabled and configured', () => {
    const logger = { warn: jest.fn() };
    const instance = {};
    typesenseClientConstructor.mockReturnValue(instance);

    expect(
      buildTypesenseClient({
        enabled: true,
        apiKey: 'secret',
        rawUrl: 'https://search.example.com',
        logger: logger as never,
      }),
    ).toBe(instance);
    expect(typesenseClientConstructor).toHaveBeenCalledWith({
      apiKey: 'secret',
      nodes: [{ host: 'search.example.com', port: 443, protocol: 'https' }],
      connectionTimeoutSeconds: 5,
    });

    expect(buildTypesenseClient({ enabled: false, logger: logger as never })).toBeNull();
  });

  it('logs configuration warnings when enabled values are missing', () => {
    const logger = { warn: jest.fn() };

    expect(
      buildTypesenseClient({
        enabled: true,
        rawUrl: 'https://search.example.com',
        logger: logger as never,
      }),
    ).toBeNull();
    expect(
      buildTypesenseClient({
        enabled: true,
        apiKey: 'secret',
        rawUrl: '',
        logger: logger as never,
      }),
    ).toBeNull();

    expect(logger.warn).toHaveBeenCalledWith(
      'Typesense is enabled but TYPESENSE_API_KEY is missing. Disabling search indexing.',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Typesense is enabled but TYPESENSE_URL is missing or invalid. Disabling search indexing.',
    );
  });
});
