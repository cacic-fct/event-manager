import { Metadata, status, type handleUnaryCall, type ServerUnaryCall } from '@grpc/grpc-js';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { createEventManagerGrpcHandlers, toServiceError } from './event-manager-grpc.server';

describe('toServiceError', () => {
  it('keeps HttpException details and hides unexpected error messages', () => {
    expect(toServiceError(new BadRequestException('Invalid request.'))).toMatchObject({
      code: status.INVALID_ARGUMENT,
      details: 'Invalid request.',
    });
    expect(toServiceError(new Error('database password leaked'))).toMatchObject({
      code: status.INTERNAL,
      details: 'Internal gRPC service error.',
    });
  });
});

describe('CancelLgpdDeletion', () => {
  it('authorizes lgpd deletion, maps the request, and serializes the result', async () => {
    const auth = {
      authenticateAccessToken: jest.fn().mockResolvedValue({}),
      assertMachineToMachinePrincipal: jest.fn().mockReturnValue({}),
    };
    const lgpd = {
      cancelDeletion: jest.fn().mockResolvedValue({ success: true, peopleUpdated: 1, recordsUpdated: 2 }),
    };
    const handlers = createEventManagerGrpcHandlers({
      auth,
      lgpd,
    } as never);
    const handler = handlers['cancelLgpdDeletion'] as handleUnaryCall<Record<string, unknown>, Record<string, unknown>>;
    const metadata = new Metadata();
    metadata.set('authorization', 'Bearer m2m-token');

    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      handler(
        {
          metadata,
          request: { requestId: ' request-1 ', userId: ' user-1 ', email: ' user@example.com ' },
        } as ServerUnaryCall<Record<string, unknown>, Record<string, unknown>>,
        (error: Error | null, value: Record<string, unknown> | null) => (error ? reject(error) : resolve(value ?? {})),
      );
    });

    expect(auth.authenticateAccessToken).toHaveBeenCalledWith('m2m-token');
    expect(auth.assertMachineToMachinePrincipal).toHaveBeenCalledWith({}, { requiredRoles: ['lgpd:delete'] });
    expect(lgpd.cancelDeletion).toHaveBeenCalledWith({
      requestId: 'request-1',
      userId: 'user-1',
      email: 'user@example.com',
    });
    expect(response).toEqual({ json: JSON.stringify({ success: true, peopleUpdated: 1, recordsUpdated: 2 }) });
  });
});

describe('gRPC call lifecycle', () => {
  it('rejects an already-cancelled call before authentication or domain work', async () => {
    const auth = {
      authenticateAccessToken: jest.fn(),
      assertMachineToMachinePrincipal: jest.fn(),
    };
    const voting = { listLinkableEvents: jest.fn() };
    const handler = createEventManagerGrpcHandlers({ auth, voting } as never)['listVotingEvents'] as handleUnaryCall<
      Record<string, unknown>,
      Record<string, unknown>
    >;

    const error = await new Promise<Error & { code?: status }>((resolve) => {
      handler({ cancelled: true, metadata: new Metadata(), request: {} } as never, (callbackError) =>
        resolve(callbackError as Error & { code?: status }),
      );
    });

    expect(error.code).toBe(status.CANCELLED);
    expect(auth.authenticateAccessToken).not.toHaveBeenCalled();
    expect(voting.listLinkableEvents).not.toHaveBeenCalled();
  });

  it('stops the command chain when a caller cancels during authentication', async () => {
    let resolveAuthentication!: (value: object) => void;
    const authentication = new Promise<object>((resolve) => {
      resolveAuthentication = resolve;
    });
    const auth = {
      authenticateAccessToken: jest.fn().mockReturnValue(authentication),
      assertMachineToMachinePrincipal: jest.fn().mockReturnValue({}),
    };
    const voting = { listLinkableEvents: jest.fn() };
    const handler = createEventManagerGrpcHandlers({ auth, voting } as never)['listVotingEvents'] as handleUnaryCall<
      Record<string, unknown>,
      Record<string, unknown>
    >;
    const metadata = new Metadata();
    metadata.set('authorization', 'Bearer m2m-token');
    const call = Object.assign(new EventEmitter(), {
      cancelled: false,
      metadata,
      request: {},
      getDeadline: () => Infinity,
    });

    const callbackResult = new Promise<Error & { code?: status }>((resolve) => {
      handler(call as never, (callbackError) => resolve(callbackError as Error & { code?: status }));
    });
    call.emit('cancelled');
    const error = await callbackResult;
    resolveAuthentication({});
    await Promise.resolve();

    expect(error.code).toBe(status.CANCELLED);
    expect(auth.assertMachineToMachinePrincipal).not.toHaveBeenCalled();
    expect(voting.listLinkableEvents).not.toHaveBeenCalled();
  });

  it('rejects an expired deadline before domain work', async () => {
    const auth = {
      authenticateAccessToken: jest.fn(),
      assertMachineToMachinePrincipal: jest.fn(),
    };
    const voting = { listLinkableEvents: jest.fn() };
    const handler = createEventManagerGrpcHandlers({ auth, voting } as never)['listVotingEvents'] as handleUnaryCall<
      Record<string, unknown>,
      Record<string, unknown>
    >;
    const call = Object.assign(new EventEmitter(), {
      cancelled: false,
      metadata: new Metadata(),
      request: {},
      getDeadline: () => Date.now() - 1,
    });

    const error = await new Promise<Error & { code?: status }>((resolve) => {
      handler(call as never, (callbackError) => resolve(callbackError as Error & { code?: status }));
    });

    expect(error.code).toBe(status.DEADLINE_EXCEEDED);
    expect(voting.listLinkableEvents).not.toHaveBeenCalled();
  });
});
