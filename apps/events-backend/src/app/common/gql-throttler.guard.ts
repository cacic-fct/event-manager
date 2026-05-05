import { Injectable, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

type GraphqlContext = {
  req?: Record<string, unknown>;
  res?: Record<string, unknown>;
  request?: Record<string, unknown>;
  reply?: Record<string, unknown>;
};

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext): {
    req: Record<string, unknown>;
    res: Record<string, unknown>;
  } {
    const gqlContext =
      GqlExecutionContext.create(context).getContext<GraphqlContext>();

    return {
      req: gqlContext.req ?? gqlContext.request ?? {},
      res: gqlContext.res ?? gqlContext.reply ?? {},
    };
  }
}
