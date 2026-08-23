import { currentRequestId, requestContextMiddleware } from './request-context';

describe('requestContextMiddleware', () => {
  it('preserves a bounded caller request id through asynchronous work', async () => {
    const setHeader = jest.fn();
    let observed: string | undefined;

    await new Promise<void>((resolve) => {
      requestContextMiddleware(
        { header: jest.fn().mockReturnValue('request-1234') } as never,
        { setHeader } as never,
        () => {
          void Promise.resolve().then(() => {
            observed = currentRequestId();
            resolve();
          });
        },
      );
    });

    expect(observed).toBe('request-1234');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request-1234');
  });

  it.each(['short', 'contains spaces', 'x'.repeat(65)])('replaces an invalid request id: %s', (value) => {
    const setHeader = jest.fn();

    requestContextMiddleware(
      { header: jest.fn().mockReturnValue(value) } as never,
      { setHeader } as never,
      () => undefined,
    );

    expect(setHeader).toHaveBeenCalledWith('x-request-id', expect.stringMatching(/^[0-9a-f-]{36}$/));
  });
});
