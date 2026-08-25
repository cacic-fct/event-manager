import { EventFormImagesService } from './event-form-images.service';

describe('EventFormImagesService references and cleanup', () => {
  it('allows one stored asset to be referenced by the form and multiple questions', async () => {
    const { service, prisma } = createHarness();
    prisma.eventFormImage.findMany.mockResolvedValue([
      { id: 'image-1', formId: 'form-1', createdById: 'user-1', objectKey: 'image-1.avif' },
    ]);
    const tx = { eventFormImage: prisma.eventFormImage, eventFormDraft: prisma.eventFormDraft };

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

  it('rejects an asset owned by another form or pending for another creator', async () => {
    const { service, prisma } = createHarness();
    prisma.eventFormImage.findMany.mockResolvedValue([
      { id: 'foreign', formId: 'form-2', createdById: 'user-2', objectKey: 'foreign.avif' },
      { id: 'pending', formId: null, createdById: 'user-2', objectKey: 'pending.avif' },
    ]);

    await expect(service.reconcile(transaction(prisma) as never, 'form-1', [{ id: 'foreign' }], [], 'user-1'))
      .rejects.toThrow('A referência de imagem do formulário é inválida.');
    await expect(service.reconcile(transaction(prisma) as never, 'form-1', [{ id: 'pending' }], [], 'user-1'))
      .rejects.toThrow('A referência de imagem do formulário é inválida.');
  });

  it('reports a missing image reference as expired', async () => {
    const { service, prisma } = createHarness();
    prisma.eventFormImage.findMany.mockResolvedValue([]);

    await expect(service.reconcile(transaction(prisma) as never, 'form-1', [{ id: 'expired' }], [], 'user-1'))
      .rejects.toThrow('Uma imagem expirou e precisa ser enviada novamente.');
  });

  it('rejects duplicate and excessive description references', async () => {
    const { service, prisma } = createHarness();
    const tx = transaction(prisma) as never;

    await expect(service.reconcile(tx, 'form-1', [{ id: 'same' }, { id: 'same' }], [], 'user-1'))
      .rejects.toThrow('A mesma imagem não pode ser repetida');
    await expect(
      service.reconcile(tx, 'form-1', Array.from({ length: 9 }, (_, index) => ({ id: `image-${index}` })), [], 'user-1'),
    ).rejects.toThrow('Cada descrição pode incluir no máximo 8 imagens.');
    await expect(
      service.reconcile(
        tx,
        'form-1',
        [],
        Array.from({ length: 11 }, (_, elementIndex) => ({
          id: `question-${elementIndex}`,
          type: 'shortText' as const,
          title: `Pergunta ${elementIndex}`,
          required: false,
          options: [],
          descriptionImages: Array.from({ length: 8 }, (_, imageIndex) => ({ id: `image-${elementIndex}-${imageIndex}` })),
        })),
        'user-1',
      ),
    ).rejects.toThrow('Um formulário pode incluir no máximo 80 imagens.');
  });

  it('preserves images referenced by an active draft during reconciliation', async () => {
    const { service, prisma } = createHarness();
    prisma.eventFormImage.findMany.mockResolvedValue([
      { id: 'draft-image', formId: 'form-1', createdById: 'user-1', objectKey: 'draft-image.avif' },
      { id: 'removed-image', formId: 'form-1', createdById: 'user-1', objectKey: 'removed-image.avif' },
    ]);
    prisma.eventFormDraft.findMany.mockResolvedValue([
      { payload: { descriptionImagesJson: JSON.stringify([{ id: 'draft-image' }]), elementsJson: '[]' } },
    ]);

    await expect(service.reconcile(transaction(prisma) as never, 'form-1', [], [], 'user-1')).resolves.toEqual([
      'removed-image.avif',
    ]);

    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledWith({
      where: { formId: 'form-1', id: { in: ['removed-image'] } },
    });
  });

  it('preserves assets used by the live form or an active draft and removes abandoned assets', async () => {
    const { service, prisma, s3 } = createHarness();
    const now = new Date();
    const old = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1_000);
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000);
    prisma.eventFormImage.findMany
      .mockResolvedValueOnce([
        image('live', 'form-1', old),
        image('draft', 'form-1', old),
        image('unused', 'form-1', old),
        image('pending', null, old),
      ])
      .mockResolvedValueOnce([]);
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

    await expect(service.cleanupUnusedImages(now)).resolves.toBe(2);

    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'unused', updatedAt: { lt: cutoff } },
    });
    expect(prisma.eventFormImage.deleteMany).toHaveBeenCalledWith({
      where: { id: 'pending', updatedAt: { lt: cutoff } },
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
    eventFormDraft: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const s3 = { deleteFile: jest.fn().mockResolvedValue(undefined) };
  const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  return {
    prisma,
    s3,
    service: new EventFormImagesService(prisma as never, s3 as never, authorization as never, {} as never),
  };
}

function transaction(prisma: ReturnType<typeof createHarness>['prisma']) {
  return { eventFormImage: prisma.eventFormImage, eventFormDraft: prisma.eventFormDraft };
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
