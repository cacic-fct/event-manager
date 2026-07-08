import { HttpException, HttpStatus } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { GraphQLError } from 'graphql';
import type { Request, Response } from 'express';
import { RATE_LIMIT_METADATA_KEY, RateLimitMetadata } from './rate-limit.decorator';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_POLICIES } from './rate-limit.policies';
import { RateLimitDecision, RateLimitService } from './rate-limit.service';

describe('RateLimitGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let rateLimits: jest.Mocked<Pick<RateLimitService, 'consume' | 'toGraphQLError' | 'toHttpException'>>;
  let guard: RateLimitGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    rateLimits = {
      consume: jest.fn(),
      toGraphQLError: jest.fn(),
      toHttpException: jest.fn(),
    };
    guard = new RateLimitGuard(reflector as unknown as Reflector, rateLimits as unknown as RateLimitService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows requests without rate-limit metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createHttpContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(RATE_LIMIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    expect(rateLimits.consume).not.toHaveBeenCalled();
  });

  it('passes HTTP request, response, and resolved resource parts to the rate-limit service', async () => {
    const request = {
      body: {
        event: {
          id: ' event-1 ',
          empty: '   ',
        },
      },
      params: {
        count: 42,
      },
      query: {
        preview: true,
        missingRoot: null,
      },
    } as unknown as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    const metadata = createMetadata([
      { source: 'body', path: 'event.id' },
      { source: 'body', path: 'event.empty' },
      { source: 'body', path: 'event.missing' },
      { source: 'params', path: 'count' },
      { source: 'query', path: 'preview' },
      { source: 'query', path: 'missingRoot.id' },
    ]);
    reflector.getAllAndOverride.mockReturnValue(metadata);
    rateLimits.consume.mockResolvedValue(createDecision(true));

    await expect(guard.canActivate(createHttpContext(request, response))).resolves.toBe(true);

    expect(rateLimits.consume).toHaveBeenCalledWith({
      policy: metadata.policy,
      request,
      response,
      resourceParts: ['event-1', '42', 'true'],
    });
  });

  it('uses an empty resource list when metadata omits resource locators', async () => {
    const metadata = {
      policy: RATE_LIMIT_POLICIES.publicEvents,
    } satisfies RateLimitMetadata;
    reflector.getAllAndOverride.mockReturnValue(metadata);
    rateLimits.consume.mockResolvedValue(createDecision(true));

    await expect(guard.canActivate(createHttpContext())).resolves.toBe(true);

    expect(rateLimits.consume).toHaveBeenCalledWith(expect.objectContaining({ resourceParts: [] }));
  });

  it('throws HTTP rate-limit exceptions for blocked HTTP requests', async () => {
    const exception = new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
    reflector.getAllAndOverride.mockReturnValue(createMetadata());
    rateLimits.consume.mockResolvedValue(createDecision(false));
    rateLimits.toHttpException.mockReturnValue(exception);

    await expect(guard.canActivate(createHttpContext())).rejects.toBe(exception);

    expect(rateLimits.toHttpException).toHaveBeenCalledWith(expect.objectContaining({ allowed: false }));
  });

  it('passes GraphQL args and request context to the rate-limit service', async () => {
    const request = { res: { setHeader: jest.fn() } as unknown as Response } as Request & { res: Response };
    const metadata = createMetadata([{ source: 'args', path: 'input.eventId' }]);
    reflector.getAllAndOverride.mockReturnValue(metadata);
    rateLimits.consume.mockResolvedValue(createDecision(true));
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getArgs: () => ({
        input: {
          eventId: 'event-2',
        },
      }),
      getContext: () => ({
        request,
      }),
    } as unknown as GqlExecutionContext);

    await expect(guard.canActivate(createGraphqlContext())).resolves.toBe(true);

    expect(rateLimits.consume).toHaveBeenCalledWith({
      policy: metadata.policy,
      request,
      response: request.res,
      resourceParts: ['event-2'],
    });
  });

  it('prefers explicit GraphQL response objects when available', async () => {
    const request = {} as Request;
    const response = { setHeader: jest.fn() } as unknown as Response;
    reflector.getAllAndOverride.mockReturnValue(createMetadata());
    rateLimits.consume.mockResolvedValue(createDecision(true));
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getArgs: () => ({}),
      getContext: () => ({
        req: request,
        res: response,
      }),
    } as unknown as GqlExecutionContext);

    await expect(guard.canActivate(createGraphqlContext())).resolves.toBe(true);

    expect(rateLimits.consume).toHaveBeenCalledWith(expect.objectContaining({ request, response }));
  });

  it('supports GraphQL contexts without request or response objects', async () => {
    reflector.getAllAndOverride.mockReturnValue(createMetadata());
    rateLimits.consume.mockResolvedValue(createDecision(true));
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getArgs: () => ({}),
      getContext: () => ({}),
    } as unknown as GqlExecutionContext);

    await expect(guard.canActivate(createGraphqlContext())).resolves.toBe(true);

    expect(rateLimits.consume).toHaveBeenCalledWith(
      expect.objectContaining({
        request: undefined,
        response: undefined,
      }),
    );
  });

  it('throws GraphQL rate-limit errors for blocked GraphQL requests', async () => {
    const graphQLError = new Error('Too many requests') as GraphQLError;
    reflector.getAllAndOverride.mockReturnValue(createMetadata());
    rateLimits.consume.mockResolvedValue(createDecision(false));
    rateLimits.toGraphQLError.mockReturnValue(graphQLError);
    jest.spyOn(GqlExecutionContext, 'create').mockReturnValue({
      getArgs: () => ({}),
      getContext: () => ({
        req: {},
        reply: {},
      }),
    } as unknown as GqlExecutionContext);

    await expect(guard.canActivate(createGraphqlContext())).rejects.toBe(graphQLError);

    expect(rateLimits.toGraphQLError).toHaveBeenCalledWith(expect.objectContaining({ allowed: false }));
  });

  function createMetadata(resources: RateLimitMetadata['resources'] = []): RateLimitMetadata {
    return {
      policy: RATE_LIMIT_POLICIES.publicEvents,
      resources,
    };
  }

  function createDecision(allowed: boolean): RateLimitDecision {
    return {
      allowed,
      disabled: false,
      wouldBlock: !allowed,
      policyName: RATE_LIMIT_POLICIES.publicEvents.name,
      limit: RATE_LIMIT_POLICIES.publicEvents.maxAttempts,
      attempts: allowed ? 1 : RATE_LIMIT_POLICIES.publicEvents.maxAttempts,
      remaining: allowed ? RATE_LIMIT_POLICIES.publicEvents.maxAttempts - 1 : 0,
      retryAfterSeconds: allowed ? 0 : 60,
      resetSeconds: 60,
      cooldownSeconds: allowed ? 0 : 60,
    };
  }

  function createHttpContext(
    request: Request = {
      body: {},
      params: {},
      query: {},
    } as Request,
    response: Response = {} as Response,
  ): ExecutionContext {
    const handler = () => undefined;
    class Controller {}

    return {
      getHandler: () => handler,
      getClass: () => Controller,
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  function createGraphqlContext(): ExecutionContext {
    const handler = () => undefined;
    class Resolver {}

    return {
      getHandler: () => handler,
      getClass: () => Resolver,
      getType: () => 'graphql',
    } as unknown as ExecutionContext;
  }
});
