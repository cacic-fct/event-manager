import { Test } from '@nestjs/testing';
import { MODULE_METADATA } from '@nestjs/common/constants';
import Redis from 'ioredis';
import { firstValueFrom, take } from 'rxjs';
import { AppModule } from '../app.module';
import { InMemoryRedisClient } from '../redis/in-memory-redis-client';
import { RealtimeInvalidationController } from './realtime-invalidation.controller';
import { PUBLIC_CATALOG_REALTIME_CHANNEL } from './public-catalog-invalidation';
import { RealtimeFingerprintService } from './realtime-fingerprint.service';
import { RealtimeInvalidationService } from './realtime-invalidation.service';
import { SseReplayService } from './sse-replay.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { CurrentUserEventAttendanceResolver } from '../current-user/events/attendance.resolver';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

describe('realtime invalidation provider integration', () => {
  const previousCursorSecret = process.env.SSE_REPLAY_CURSOR_SECRET;

  beforeEach(() => {
    process.env.SSE_REPLAY_CURSOR_SECRET = 'integration-cursor-secret';
  });

  afterEach(() => {
    if (previousCursorSecret === undefined) {
      delete process.env.SSE_REPLAY_CURSOR_SECRET;
    } else {
      process.env.SSE_REPLAY_CURSOR_SECRET = previousCursorSecret;
    }
  });

  it('registers the controller and providers in the application module', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) as unknown[];
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as unknown[];

    expect(controllers).toContain(RealtimeInvalidationController);
    expect(providers).toEqual(
      expect.arrayContaining([RealtimeFingerprintService, RealtimeInvalidationService, SseReplayService]),
    );
  });

  it('wires the real providers so an SSE stream resumes after Last-Event-ID', async () => {
    const redis = new InMemoryRedisClient();
    const moduleRef = await Test.createTestingModule({
      controllers: [RealtimeInvalidationController],
      providers: [
        RealtimeInvalidationService,
        SseReplayService,
        { provide: Redis, useValue: redis },
        { provide: RealtimeFingerprintService, useValue: { currentUser: jest.fn(), eventSubscriptions: jest.fn(), majorEventSubscriptions: jest.fn() } },
        { provide: CurrentUserContextService, useValue: { requireCurrentPerson: jest.fn() } },
        { provide: CurrentUserEventAttendanceResolver, useValue: { currentUserOrganizerInfo: jest.fn() } },
        { provide: AuthorizationPolicyService, useValue: { hasEventManagerAccess: jest.fn(() => true), assertPermissions: jest.fn() } },
        { provide: RateLimitService, useValue: { consume: jest.fn(), toHttpException: jest.fn() } },
      ],
    }).compile();

    try {
      await moduleRef.init();
      const realtime = moduleRef.get(RealtimeInvalidationService);
      const controller = moduleRef.get(RealtimeInvalidationController);
      const scope = realtime.scope(PUBLIC_CATALOG_REALTIME_CHANNEL);
      const first = await realtime.publish(scope, {
        type: 'PUBLIC_CATALOG_INVALIDATED',
        revision: 'revision-1',
      });
      const second = await realtime.publish(scope, {
        type: 'PUBLIC_CATALOG_INVALIDATED',
        revision: 'revision-2',
      });

      await expect(
        firstValueFrom(controller.streamPublicCatalog(first.id).pipe(take(1))),
      ).resolves.toEqual(second);
    } finally {
      await moduleRef.close();
    }
  });
});
