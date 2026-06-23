import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { TURNSTILE_ACTIONS, TURNSTILE_TOKEN_HEADER } from '@cacic-fct/shared-utils';
import { ReceiptUploadTurnstileGuard } from './receipt-upload-turnstile.guard';
import { TurnstileService } from './turnstile.service';

describe('ReceiptUploadTurnstileGuard', () => {
  const turnstile = {
    assertValidToken: jest.fn(),
  };
  let guard: ReceiptUploadTurnstileGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    turnstile.assertValidToken.mockResolvedValue(undefined);
    guard = new ReceiptUploadTurnstileGuard(turnstile as unknown as TurnstileService);
  });

  it('validates the receipt upload token from the request header', async () => {
    const request = {
      headers: {
        [TURNSTILE_TOKEN_HEADER]: 'token',
      },
    };

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);

    expect(turnstile.assertValidToken).toHaveBeenCalledWith(
      'token',
      request,
      TURNSTILE_ACTIONS.receiptUpload,
    );
  });

  it('uses the first header value when proxies duplicate the token header', async () => {
    const request = {
      headers: {
        [TURNSTILE_TOKEN_HEADER]: ['first-token', 'second-token'],
      },
    };

    await expect(guard.canActivate(createHttpContext(request))).resolves.toBe(true);

    expect(turnstile.assertValidToken).toHaveBeenCalledWith(
      'first-token',
      request,
      TURNSTILE_ACTIONS.receiptUpload,
    );
  });

  it('fails before request body parsing when the token is missing or invalid', async () => {
    const error = new BadRequestException('Turnstile verification is required.');
    turnstile.assertValidToken.mockRejectedValue(error);

    await expect(
      guard.canActivate(
        createHttpContext({
          headers: {},
        }),
      ),
    ).rejects.toBe(error);
  });
});

function createHttpContext(request: { headers: Record<string, string | string[] | undefined> }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
