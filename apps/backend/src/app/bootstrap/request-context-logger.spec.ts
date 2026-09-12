import { ConsoleLogger } from '@nestjs/common';
import { RequestContextLogger } from './request-context-logger';
import { requestContextMiddleware } from './request-context';

describe('RequestContextLogger', () => {
  it('correlates overlapping asynchronous requests without reading their payloads', async () => {
    const output = jest.spyOn(ConsoleLogger.prototype, 'printMessages' as never).mockImplementation(() => undefined);
    const logger = new RequestContextLogger();
    const release: Array<() => void> = [];
    try {
      const requests = ['request-one', 'request-two'].map(
        (requestId) =>
          new Promise<void>((resolve) => {
            requestContextMiddleware(
              { header: () => requestId, body: { token: 'private' } } as never,
              { setHeader: jest.fn() } as never,
              () => {
                void new Promise<void>((done) => release.push(done)).then(() => {
                  logger.error(`Failure for ${requestId}`);
                  resolve();
                });
              },
            );
          }),
      );
      release[1]();
      release[0]();
      await Promise.all(requests);
      expect(output.mock.calls.map((call) => call[0])).toEqual([
        [{ requestId: 'request-two', message: 'Failure for request-two' }],
        [{ requestId: 'request-one', message: 'Failure for request-one' }],
      ]);
      expect(JSON.stringify(output.mock.calls)).not.toContain('private');
      logger.log('Background work');
      expect(output.mock.calls[2][0]).toEqual(['Background work']);
    } finally {
      output.mockRestore();
    }
  });
});
