import { BadRequestException, RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let analyticsService: jest.Mocked<Pick<AnalyticsService, 'forwardEnvelope'>>;
  let controller: AnalyticsController;

  beforeEach(() => {
    analyticsService = {
      forwardEnvelope: jest.fn().mockResolvedValue(undefined),
    };

    controller = new AnalyticsController(analyticsService as AnalyticsService);
  });

  it('rejects unknown tunnel projects without forwarding the envelope', async () => {
    await expect(controller.tunnel('unknown-project', createRequest())).rejects.toBeInstanceOf(BadRequestException);

    expect(analyticsService.forwardEnvelope).not.toHaveBeenCalled();
  });

  it('forwards known tunnel projects to the analytics service', async () => {
    const request = createRequest();

    await expect(controller.tunnel('admin', request)).resolves.toBeUndefined();

    expect(analyticsService.forwardEnvelope).toHaveBeenCalledWith('admin', request);
  });

  function createRequest(): RawBodyRequest<Request> {
    return {
      rawBody: Buffer.from('{"event_id":"event-1"}'),
    } as RawBodyRequest<Request>;
  }
});
