import { EventFormImagesService } from './event-form-images.service';

describe('EventFormImagesService references and cleanup', () => {
  it('allows one stored asset to be referenced by the form and multiple questions', async () => {
    const { service, prisma } = createHarness();
    prisma.eventFormImage.findMany.mockResolvedValue([
      { id: 'image-1', formId: 'form-1', createdById: 'user-1' },
    ]);
    const tx = { eventFormImage: prisma.eventFormImage };

    await expect(
      service.reconcile(
        tx as never,
        'form-1',
        [{ id: 'image-1', caption: 'Capa' }],
        [
          question('question-1', 'image-1'),
          question('question-2', 'image-1'),
        ],
        'user-1',
      ),
    ).resolves.toEqual([]);

    expect(prisma.eventFormImage.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['image-1'] },
        OR: [{ formId: 'form-1' }, { formId: null, createdById: 'user-1' }],
      },
      data: { formId: 'form-1', updatedAt: expect.any(Date) },
    });
  });

  it('preserves assets used by the live form or an active draft and removes abandoned assets', async () => {
    const { service, prisma, s3 } = createHarness();
    const old = new Date('2026-08-20T12:00:00.000Z');
    prisma.eventFormImage.findMany.mockResolvedValue([
      image('live', 'form-1', old),
      image('draft', 'form-1', old),
      image('unused', 'form-1', old),
      image('pending', null, old),
    ]);
    prisma.eventForm.findMany.mockResolvedValue([
      {
        id: 'form-1',
        descriptionImages: [{ id: 'live' }],
        elements: [],
        deletedAt: null,
      },
    ]);
    prisma.eventFormDraft.findMany.mockResolvedValue([
      {
        sourceFormId: 'form-1',
        payload: {
          descriptionImagesJson: '[]',
          elementsJson: JSON.stringify([
            { id: 'question-1', descriptionImages: [{ id: 'draft' }] },
          ]),
        },
      },
    ]);
    prisma.eventFormImage.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.cleanupUnusedImages(new Date('2026-08-25T12:00:00.000Z'))).resolves.toBe(2);

    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'unused', updatedAt: { lt: new Date('2026-08-24T12:00:00.000Z') } },
    });
    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pending', updatedAt: { lt: new Date('2026-08-24T12:00:00.000Z') } },
    });
    expect(s3.deleteFile).toHaveBeenCalledTimes(2);
  });
});

function createHarness() {
  const prisma = {
    eventFormImage: {
      findMany: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn(),
    },
    eventForm: { findMany: jest.fn() },
    eventFormDraft: { findMany: jest.fn() },
  };
  const s3 = { deleteFile: jest.fn().mockResolvedValue(undefined) };
  const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    s3,
    service: new EventFormImagesService(prisma as never, s3 as never, authorization as never),
  };
}

function question(id: string, imageId: string) {
  return {
    id,
    type: 'shortText' as const,
    title: id,
    required: false,
    options: [],
    descriptionImages: [{ id: imageId, url: '', width: 0, height: 0 }],
  };
}

function image(id: string, formId: string | null, updatedAt: Date) {
  return {
    id,
    formId,
    objectKey: `event-forms/${id}.avif`,
    updatedAt,
  };
}
