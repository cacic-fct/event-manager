import { ensureWorkspaceTierSubscriptionPolicy } from './tier-subscription-policy';

function setup(overrides = {}) {
  const tier = {
    name: 'Aluno',
    restrictEventSelection: true,
    allowedEventIds: ['course-1'],
    customizeSubscriptionLimits: true,
    maxCoursesPerAttendee: 1,
    ...overrides,
  };
  const tx = {
    majorEvent: {
      findFirst: jest.fn().mockResolvedValue({ maxCoursesPerAttendee: 5, majorEventPrices: [{ tiers: [tier] }] }),
    },
    event: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'course-1', type: 'MINICURSO', eventGroupId: null },
        { id: 'course-2', type: 'MINICURSO', eventGroupId: null },
        { id: 'lecture-1', type: 'PALESTRA', eventGroupId: null },
      ]),
    },
  };
  return { tx };
}

describe('workspace tier enrollment policy', () => {
  it('preserves legacy staff enrollment when no tier option is enabled', async () => {
    const { tx } = setup({ restrictEventSelection: false, customizeSubscriptionLimits: false });
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', null, ['course-2'])).resolves.toBeNull();
    expect(tx.event.findMany).not.toHaveBeenCalled();
  });

  it('validates using current transactional tier configuration', async () => {
    const { tx } = setup();
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', ' ALUNO ', ['course-1'])).resolves.toBe(
      'Aluno',
    );
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-2'])).rejects.toThrow(
      'não é permitido',
    );
    expect(tx.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ majorEventId: 'major-1' }, { eventGroup: { majorEventId: 'major-1', deletedAt: null } }],
        }),
      }),
    );
  });

  it('requires a valid price tier when policies are configured', async () => {
    const { tx } = setup();
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', null, ['course-1'])).rejects.toThrow(
      'política de inscrição válida',
    );
  });

  it('rejects events not in the current major event', async () => {
    const { tx } = setup();
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['foreign'])).rejects.toThrow(
      'pertencer à programação',
    );
  });

  it('enforces zero and unlimited category quotas', async () => {
    const { tx } = setup({ restrictEventSelection: false, maxCoursesPerAttendee: 0 });
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-1'])).rejects.toThrow(
      'limite da faixa é 0',
    );
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['lecture-1'])).resolves.toBe(
      'Aluno',
    );
  });

  it('applies custom quotas even when every event is available', async () => {
    const { tx } = setup({ restrictEventSelection: false });
    await expect(
      ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-1', 'course-2']),
    ).rejects.toThrow('limite da faixa é 1');
  });

  it('rejects partial selections of an allowed event group', async () => {
    const { tx } = setup({ allowedEventIds: ['course-1', 'course-2'], maxCoursesPerAttendee: 2 });
    tx.event.findMany.mockResolvedValue([
      { id: 'course-1', type: 'MINICURSO', eventGroupId: 'group-1' },
      { id: 'course-2', type: 'MINICURSO', eventGroupId: 'group-1' },
    ]);
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-1'])).rejects.toThrow(
      'todos os eventos',
    );
    await expect(
      ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-1', 'course-2']),
    ).resolves.toBe('Aluno');
  });

  it('does not let staff enroll activities using a sports-only tier', async () => {
    const { tx } = setup({
      restrictEventSelection: false,
      customizeSubscriptionLimits: false,
      includesEventRegistration: false,
    });
    await expect(ensureWorkspaceTierSubscriptionPolicy(tx as never, 'major-1', 'Aluno', ['course-1'])).rejects.toThrow(
      'não é permitido',
    );
  });
});
