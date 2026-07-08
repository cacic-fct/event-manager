import 'reflect-metadata';
import { RATE_LIMIT_METADATA_KEY, RateLimit } from './rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from './rate-limit.policies';

describe('RateLimit decorator', () => {
  it('stores policy and resource locators on route handlers', () => {
    class Controller {
      handler(): string {
        return 'ok';
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    if (!descriptor) {
      throw new Error('Expected handler descriptor.');
    }
    const resources = [{ source: 'body' as const, path: 'event.id' }];

    RateLimit(RATE_LIMIT_POLICIES.publicEvents, resources)(Controller.prototype, 'handler', descriptor);

    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, descriptor.value)).toEqual({
      policy: RATE_LIMIT_POLICIES.publicEvents,
      resources,
    });
  });

  it('defaults to an empty resource locator list', () => {
    class Controller {
      handler(): string {
        return 'ok';
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Controller.prototype, 'handler');
    if (!descriptor) {
      throw new Error('Expected handler descriptor.');
    }

    RateLimit(RATE_LIMIT_POLICIES.receiptUpload)(Controller.prototype, 'handler', descriptor);

    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, descriptor.value)).toEqual({
      policy: RATE_LIMIT_POLICIES.receiptUpload,
      resources: [],
    });
  });
});
