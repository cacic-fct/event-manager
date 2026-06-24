import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request, Response } from 'express';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitMetadata,
  RateLimitResourceLocator,
} from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

type RequestLike = Request & {
  res?: Response;
};

type GraphqlContext = {
  req?: RequestLike;
  request?: RequestLike;
  res?: Response;
  reply?: Response;
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimits: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<RateLimitMetadata>(RATE_LIMIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) {
      return true;
    }

    const contextData = this.contextData(context);
    const decision = await this.rateLimits.consume({
      policy: metadata.policy,
      request: contextData.request,
      response: contextData.response,
      resourceParts: this.resourceParts(metadata.resources ?? [], contextData.sources),
    });

    if (!decision.allowed) {
      if (context.getType<'http' | 'graphql'>() === 'graphql') {
        throw this.rateLimits.toGraphQLError(decision);
      }

      throw this.rateLimits.toHttpException(decision);
    }

    return true;
  }

  private contextData(context: ExecutionContext): {
    request?: RequestLike;
    response?: Response;
    sources: Record<string, unknown>;
  } {
    if (context.getType<'http' | 'graphql'>() === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      const args = gqlContext.getArgs<Record<string, unknown>>();
      const requestContext = gqlContext.getContext<GraphqlContext>();
      const request = requestContext.req ?? requestContext.request;
      const response = requestContext.res ?? requestContext.reply ?? request?.res;

      return {
        request,
        response,
        sources: {
          args,
        },
      };
    }

    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    return {
      request,
      response: http.getResponse<Response>(),
      sources: {
        body: request.body,
        params: request.params,
        query: request.query,
      },
    };
  }

  private resourceParts(
    locators: readonly RateLimitResourceLocator[],
    sources: Record<string, unknown>,
  ): string[] {
    return locators
      .map((locator) => this.resolvePath(sources[locator.source], locator.path))
      .filter((value): value is string => Boolean(value));
  }

  private resolvePath(source: unknown, path: string): string | null {
    const value = path.split('.').reduce<unknown>((current, segment) => {
      if (current && typeof current === 'object' && segment in current) {
        return (current as Record<string, unknown>)[segment];
      }

      return undefined;
    }, source);

    if (typeof value === 'string') {
      return value.trim() || null;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return null;
  }
}
