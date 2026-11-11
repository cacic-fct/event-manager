import { jest } from '@jest/globals';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { KeycloakM2mTokenService } from './keycloak-m2m-token.service';

describe('Keycloak M2M token response compression', () => {
  it.each([
    { encoding: 'identity', compress: (body: string) => body },
    { encoding: 'gzip', compress: gzipSync },
    { encoding: 'deflate', compress: deflateSync },
    { encoding: 'br', compress: brotliCompressSync },
  ])('decodes $encoding before parsing the token response', async ({ encoding, compress }) => {
    const requests: IncomingHttpHeaders[] = [];
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const replies = [
      '{"access_token":"partial-test-token"',
      JSON.stringify({ access_token: 'test-token', expires_in: 120 }),
    ];
    const server = createServer((request, response) => {
      requests.push(request.headers);
      request.resume();
      response.writeHead(200, {
        'content-type': 'application/json',
        ...(encoding === 'identity' ? {} : { 'content-encoding': encoding }),
      });
      response.end(compress(replies.shift() ?? ''));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP address for the Keycloak test server.');
      }

      const service = new KeycloakM2mTokenService(
        new ConfigService({ KEYCLOAK_REALM_URL: `http://127.0.0.1:${address.port}/realms/test` }),
      );
      const credentials = { clientId: 'test-client', clientSecret: 'test-secret' };

      await expect(service.getClientCredentialsToken(credentials)).rejects.toThrow(
        new ServiceUnavailableException('Could not authenticate with Keycloak for M2M access.'),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Invalid JSON response'));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('partial-test-token'));
      await expect(service.getClientCredentialsToken(credentials)).resolves.toBe('test-token');
      await expect(service.getClientCredentialsToken(credentials)).resolves.toBe('test-token');
      expect(requests).toHaveLength(2);
      for (const headers of requests) {
        expect(headers).toMatchObject({
          accept: 'application/json',
          'accept-encoding': 'identity',
          'content-type': 'application/x-www-form-urlencoded',
        });
        expect(headers['content-encoding']).toBeUndefined();
      }
    } finally {
      warn.mockRestore();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
