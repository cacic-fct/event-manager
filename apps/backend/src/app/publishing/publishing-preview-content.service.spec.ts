import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PublicationState } from '@prisma/client';
import { PublicationPreviewContentService } from './publishing-preview-content.service';

describe('PublicationPreviewContentService', () => {
  function createService() {
    const prisma = {
      event: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      eventGroup: {
        findFirst: jest.fn(),
      },
      majorEvent: {
        findFirst: jest.fn(),
      },
    };
    const service = new PublicationPreviewContentService(prisma as never);

    return { prisma, service };
  }

  it('keeps a major-event preview when a visible child has unpublished changes', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-25T10:00:00.000Z'),
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      events: [
        {
          publicationState: PublicationState.PUBLISHED,
          publishedAt: new Date('2026-06-25T10:00:00.000Z'),
          updatedAt: new Date('2026-06-25T11:00:00.000Z'),
        },
      ],
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.MAJOR_EVENT,
        targetId: 'major-1',
      }),
    ).resolves.toBeNull();
  });

  it('returns the direct major-event URL only when visible children are published and fresh', async () => {
    const { prisma, service } = createService();
    prisma.majorEvent.findFirst.mockResolvedValue({
      publicationState: PublicationState.PUBLISHED,
      publishedAt: new Date('2026-06-25T10:00:00.000Z'),
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      events: [
        {
          publicationState: PublicationState.PUBLISHED,
          publishedAt: new Date('2026-06-25T10:00:00.000Z'),
          updatedAt: new Date('2026-06-25T09:30:00.000Z'),
        },
      ],
    });

    await expect(
      service.resolveDirectPublishedUrl({
        targetType: PublicationTargetType.MAJOR_EVENT,
        targetId: 'major-1',
      }),
    ).resolves.toBe('http://localhost:4200/major-event');
  });
});
