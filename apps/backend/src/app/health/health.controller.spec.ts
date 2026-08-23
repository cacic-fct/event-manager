import { PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('exposes public liveness and readiness routes without dependency details', async () => {
    const health = {
      live: jest.fn().mockReturnValue({ status: 'ok' }),
      ready: jest.fn().mockResolvedValue({
        status: 'ok',
        checks: { database: 'up', redis: 'up' },
      }),
    };
    const controller = new HealthController(health as never);

    expect(Reflect.getMetadata(PATH_METADATA, HealthController)).toBe('health');
    expect(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.live)).toBe('live');
    expect(Reflect.getMetadata(PATH_METADATA, HealthController.prototype.ready)).toBe('ready');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.live)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.ready)).toBe(true);
    expect(controller.live()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });
});
