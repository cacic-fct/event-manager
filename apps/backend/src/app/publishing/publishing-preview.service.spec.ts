import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PublicContentPreviewTargetType } from '@prisma/client';
import { PublicationPreviewService } from './publishing-preview.service';

describe('PublicationPreviewService', () => {
  function createService() {
    const prisma = {
      publicContentPreview: {
        upsert: jest.fn().mockResolvedValue({ id: 'preview-1', publicPath: '/preview/stored/event' }),
      },
    };
    const auditLog = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
    };
    const previewContent = {
      resolveDirectPublishedUrl: jest.fn().mockResolvedValue(null),
      resolvePreviewTarget: jest.fn().mockResolvedValue({ label: 'Evento', auditType: 'EVENT' }),
    };
    const redis = {
      set: jest.fn().mockResolvedValue('OK'),
    };
    const service = new PublicationPreviewService(
      prisma as never,
      auditLog as never,
      authorizationPolicy as never,
      previewContent as never,
      redis as never,
    );

    return { prisma, redis, service };
  }

  it('rotates preview tokens between issuances for the same actor and target', async () => {
    const { prisma, redis, service } = createService();
    const context = { req: { user: { sub: 'admin-1', email: 'admin@example.com' } } };
    const input = {
      targetType: PublicationTargetType.EVENT,
      targetId: 'event-1',
    };

    const first = await service.createPreview(input, context as never);
    const second = await service.createPreview(input, context as never);

    expect(first.url).not.toEqual(second.url);
    expect(prisma.publicContentPreview.upsert).toHaveBeenCalledTimes(2);
    const firstUpsert = prisma.publicContentPreview.upsert.mock.calls[0][0];
    const secondUpsert = prisma.publicContentPreview.upsert.mock.calls[1][0];
    expect(firstUpsert.create.targetType).toBe(PublicContentPreviewTargetType.EVENT);
    expect(firstUpsert.create.previewTokenHash).not.toEqual(secondUpsert.update.previewTokenHash);
    expect(firstUpsert.create.redisKey).not.toEqual(secondUpsert.update.redisKey);
    expect(redis.set.mock.calls[0][0]).not.toEqual(redis.set.mock.calls[1][0]);
  });
});
