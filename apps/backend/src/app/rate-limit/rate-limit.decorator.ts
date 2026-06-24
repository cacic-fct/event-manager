import { SetMetadata } from '@nestjs/common';
import { RateLimitPolicy } from './rate-limit.policies';

export const RATE_LIMIT_METADATA_KEY = 'cacic:rate-limit';

export type RateLimitResourceSource = 'args' | 'body' | 'params' | 'query';

export interface RateLimitResourceLocator {
  readonly source: RateLimitResourceSource;
  readonly path: string;
}

export interface RateLimitMetadata {
  readonly policy: RateLimitPolicy;
  readonly resources?: readonly RateLimitResourceLocator[];
}

export const RateLimit = (policy: RateLimitPolicy, resources: readonly RateLimitResourceLocator[] = []) =>
  SetMetadata(RATE_LIMIT_METADATA_KEY, {
    policy,
    resources,
  } satisfies RateLimitMetadata);
