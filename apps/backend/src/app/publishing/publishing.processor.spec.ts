import { BadRequestException } from '@nestjs/common';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import {
  CLEANUP_STALE_EVENT_DRAFTS_JOB,
  PUBLISH_SCHEDULED_CONTENT_JOB,
  RECONCILE_PUBLICATION_STATES_JOB,
} from './publishing.constants';
import { PublicationProcessor } from './publishing.processor';

describe('PublicationProcessor', () => {
  const processScheduledPublication = jest.fn().mockResolvedValue(undefined);
  const reconcileScheduledPublications = jest.fn().mockResolvedValue(undefined);
  const cleanupStaleEventDrafts = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([PublicationTargetType.EVENT, PublicationTargetType.MAJOR_EVENT])(
    'publishes scheduled %s content with a valid target',
    async (targetType) => {
      const processor = createProcessor();
      const data = { targetType, targetId: 'target-1' };

      await processor.process({ name: PUBLISH_SCHEDULED_CONTENT_JOB, data } as never);

      expect(processScheduledPublication).toHaveBeenCalledWith(data);
    },
  );

  it.each([
    null,
    {},
    { targetType: PublicationTargetType.EVENT },
    { targetType: PublicationTargetType.EVENT, targetId: 1 },
    { targetType: PublicationTargetType.EVENT_GROUP, targetId: 'group-1' },
  ])('rejects malformed scheduled-publication payload %#', async (data) => {
    const processor = createProcessor();

    await expect(processor.process({ name: PUBLISH_SCHEDULED_CONTENT_JOB, data } as never)).rejects.toThrow(
      BadRequestException,
    );
    expect(processScheduledPublication).not.toHaveBeenCalled();
  });

  it('reconciles scheduled publication states', async () => {
    const processor = createProcessor();

    await processor.process({ name: RECONCILE_PUBLICATION_STATES_JOB, data: {} } as never);

    expect(reconcileScheduledPublications).toHaveBeenCalledTimes(1);
  });

  it('cleans stale event drafts', async () => {
    const processor = createProcessor();

    await processor.process({ name: CLEANUP_STALE_EVENT_DRAFTS_JOB, data: {} } as never);

    expect(cleanupStaleEventDrafts).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported jobs without invoking publication services', async () => {
    const processor = createProcessor();

    await expect(processor.process({ name: 'unknown', data: {} } as never)).rejects.toThrow(BadRequestException);
    expect(processScheduledPublication).not.toHaveBeenCalled();
    expect(reconcileScheduledPublications).not.toHaveBeenCalled();
    expect(cleanupStaleEventDrafts).not.toHaveBeenCalled();
  });

  function createProcessor(): PublicationProcessor {
    return new PublicationProcessor({
      processScheduledPublication,
      reconcileScheduledPublications,
      cleanupStaleEventDrafts,
    } as never);
  }
});
