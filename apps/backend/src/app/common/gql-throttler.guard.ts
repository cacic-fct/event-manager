import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

type RequestLike = Record<string, unknown> & {
  res?: RequestLike;
};

type GraphqlContext = {
  req?: RequestLike;
  res?: RequestLike;
  request?: RequestLike;
  reply?: RequestLike;
};

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  protected override getRequestResponse(context: ExecutionContext): {
    req: RequestLike;
    res: RequestLike;
  } {
    if (context.getType<'http' | 'graphql'>() === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context).getContext<GraphqlContext>();

      return {
        req: gqlContext.req ?? gqlContext.request ?? {},
        res: gqlContext.res ?? gqlContext.reply ?? gqlContext.req?.res ?? gqlContext.request?.res ?? {},
      };
    }

    return super.getRequestResponse(context);
  }
}
