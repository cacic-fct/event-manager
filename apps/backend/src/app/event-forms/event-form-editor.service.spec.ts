import {
  EventFormAudience as ContractAudience,
  EventFormInput,
  EventFormResponseMode as ContractResponseMode,
  EventFormSigilo as ContractSigilo,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  AuditLogOperation,
  EventFormAudience,
  EventFormResponseMode,
  EventFormSigilo,
  EventFormTargetType,
  PublicationState,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventFormEditorService } from './event-form-editor.service';

type EventFormLinkInput = NonNullable<EventFormInput['links']>[number];

describe('EventFormEditorService', () => {
  let service: EventFormEditorService;
  let prisma: ReturnType<typeof createPrisma>;
  let authorizationPolicy: ReturnType<typeof createAuthorizationPolicy>;
  let auditLog: ReturnType<typeof createAuditLog>;

  const authenticatedUser: AuthenticatedUser = {
    realm_access: { roles: [] },
    sub: 'user-1',
    preferredUsername: 'ana',
    email: 'ana@example.com',
    token: 'token',
    roles: [],
    roleSet: new Set<string>(),
    permissions: [],
    permissionSet: new Set<string>(),
    oidcScopes: [],
    oidcScopeSet: new Set<string>(),
    scopes: [],
    scopeSet: new Set<string>(),
    claims: { name: 'Ana Silva' },
  };

  beforeEach(() => {
    jest.useRealTimers();
    prisma = createPrisma();
    authorizationPolicy = createAuthorizationPolicy();
    auditLog = createAuditLog();
    service = new EventFormEditorService(
      prisma as unknown as jest.Mocked<PrismaService>,
      authorizationPolicy as unknown as jest.Mocked<AuthorizationPolicyService>,
      auditLog as unknown as jest.Mocked<AuditLogService>,
    );
  });

  it('creates forms with normalized fields, links, permissions, and audit log entries', async () => {
    const created = formRecord({
      id: 'form-created',
      name: 'Pesquisa inicial',
      ownerEventId: 'event-1',
      resultsPublic: true,
      resultsLive: true,
      links: [
        linkRecord({
          id: 'link-created',
          formId: 'form-created',
          eventId: 'event-2',
          notifyOnPublish: true,
          allowLecturerManualPublish: true,
        }),
      ],
    });
    prisma.eventForm.create.mockResolvedValue({ id: 'form-created' });
    prisma.eventForm.findUniqueOrThrow.mockResolvedValue(created);

    const result = await service.saveForm(
      formInput({
        name: '  Pesquisa inicial  ',
        description: '  Coleta de tamanhos  ',
        ownerEventId: ' event-1 ',
        resultsPublic: true,
        resultsLive: true,
        allowResponseEdits: true,
        links: [
          linkInput({
            eventId: ' event-2 ',
            notifyOnPublish: true,
            allowLecturerManualPublish: true,
          }),
        ],
      }),
      authenticatedUser,
    );

    expect(result.id).toBe('form-created');
    expect(result.links).toHaveLength(1);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Create],
      {
        eventId: 'event-1',
        majorEventId: undefined,
        allowScopedCollection: true,
      },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Create],
      { eventId: 'event-2', majorEventId: undefined },
    );
    expect(prisma.eventForm.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Pesquisa inicial',
        description: 'Coleta de tamanhos',
        ownerEventId: 'event-1',
        ownerMajorEventId: null,
        elements: [{ id: 'element-1', type: 'shortText', title: 'Nome', descriptionImages: [], required: false, options: [] }],
        sigilo: EventFormSigilo.SECRET,
        responseMode: EventFormResponseMode.ONE_PER_TARGET,
        resultsPublic: true,
        resultsLive: true,
        allowResponseEdits: true,
        createdById: 'user-1',
        updatedById: 'user-1',
      }),
    });
    expect(prisma.eventFormLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { formId: 'form-created', deletedAt: null },
        data: expect.objectContaining({ updatedById: 'user-1' }),
      }),
    );
    expect(prisma.eventFormLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        formId: 'form-created',
        eventId: 'event-2',
        notifyOnPublish: true,
        allowLecturerManualPublish: true,
        createdById: 'user-1',
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.CREATE,
        entityId: 'form-created',
        summary: 'Formulário "Pesquisa inicial" criado.',
      }),
      prisma,
    );
  });

  it('updates forms and only keeps live results when public results stay enabled', async () => {
    const existing = formRecord({
      ownerEventId: 'event-1',
      resultsPublic: true,
      resultsLive: true,
      links: [
        linkRecord({ id: 'link-1', eventId: 'event-2' }),
        linkRecord({ id: 'link-removed', eventId: 'event-3' }),
      ],
    });
    const updated = formRecord({
      name: 'Pesquisa revisada',
      ownerMajorEventId: 'major-1',
      resultsPublic: false,
      resultsLive: false,
      links: [
        linkRecord({
          id: 'link-1',
          targetType: EventFormTargetType.MAJOR_EVENT,
          eventId: null,
          majorEventId: 'major-2',
        }),
      ],
    });
    prisma.eventForm.findFirst.mockResolvedValue(existing);
    prisma.eventForm.findUniqueOrThrow.mockResolvedValue(updated);

    const result = await service.saveForm(
      formInput({
        id: 'form-1',
        name: 'Pesquisa revisada',
        ownerEventId: null,
        ownerMajorEventId: 'major-1',
        resultsPublic: false,
        resultsLive: true,
        links: [
          linkInput({
            id: 'link-1',
            targetType: EventFormTargetType.MAJOR_EVENT,
            eventId: null,
            majorEventId: 'major-2',
            insertInSubscriptionFlow: true,
            requiredInSubscriptionFlow: true,
            notifyOnPublish: true,
            allowLecturerManualPublish: true,
          }),
        ],
      }),
      authenticatedUser,
    );

    expect(result.resultsPublic).toBe(false);
    expect(result.resultsLive).toBe(false);
    expect(prisma.eventForm.update).toHaveBeenCalledWith({
      where: { id: 'form-1' },
      data: expect.objectContaining({
        ownerEventId: null,
        ownerMajorEventId: 'major-1',
        resultsPublic: false,
        resultsLive: false,
        updatedById: 'user-1',
      }),
    });
    expect(prisma.eventFormLink.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { formId: 'form-1', deletedAt: null, id: { notIn: ['link-1'] } },
      }),
    );
    expect(prisma.eventFormLink.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'link-1', formId: 'form-1', deletedAt: null },
        data: expect.objectContaining({
          targetType: EventFormTargetType.MAJOR_EVENT,
          majorEventId: 'major-2',
          notifyOnPublish: false,
          allowLecturerManualPublish: false,
        }),
      }),
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Update],
      { eventFormId: 'form-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Update],
      { eventId: 'event-3', majorEventId: undefined },
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        entityId: 'form-1',
        summary: 'Formulário "Pesquisa revisada" atualizado.',
      }),
      prisma,
    );
  });

  it('creates drafts with parsed payload and actor metadata', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    prisma.eventForm.findFirst.mockResolvedValue(formRecord({ name: 'Formulário base' }));
    prisma.eventFormDraft.create.mockResolvedValue(
      draftRecord({
        id: 'draft-created',
        name: 'Rascunho aberto',
        expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      }),
    );

    const result = await service.saveDraft(
      {
        sourceFormId: 'form-1',
        input: formInput({
          name: '  Rascunho aberto  ',
          elementsJson: '[{"type":"longText","title":"Comentário"}]',
        }),
      },
      authenticatedUser,
    );

    expect(result.id).toBe('draft-created');
    expect(prisma.eventFormDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceFormId: 'form-1',
        name: 'Rascunho aberto',
        payload: expect.objectContaining({
          name: '  Rascunho aberto  ',
          elementsJson: '[{"id":"element-1","type":"longText","title":"Comentário","descriptionImages":[],"required":false,"options":[]}]',
        }),
        createdById: 'user-1',
        createdByName: 'Ana Silva',
        createdByEmail: 'ana@example.com',
        updatedById: 'user-1',
        updatedByName: 'Ana Silva',
        updatedByEmail: 'ana@example.com',
        expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      }),
    });
  });

  it('updates existing drafts only when they belong to the source form', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    prisma.eventForm.findFirst.mockResolvedValue(formRecord());
    prisma.eventFormDraft.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventFormDraft.findUniqueOrThrow.mockResolvedValue(
      draftRecord({
        id: 'draft-1',
        name: 'Rascunho revisado',
        updatedById: 'user-1',
        expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      }),
    );

    const result = await service.saveDraft(
      {
        sourceFormId: 'form-1',
        draftId: 'draft-1',
        input: formInput({ name: 'Rascunho revisado' }),
      },
      authenticatedUser,
    );

    expect(result.name).toBe('Rascunho revisado');
    expect(prisma.eventFormDraft.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'draft-1',
        sourceFormId: 'form-1',
      },
      data: expect.objectContaining({
        name: 'Rascunho revisado',
        updatedById: 'user-1',
        updatedByName: 'Ana Silva',
        updatedByEmail: 'ana@example.com',
        expiresAt: new Date('2026-08-06T12:00:00.000Z'),
      }),
    });
    expect(prisma.eventFormDraft.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
    });
  });

  it('lists only non-expired drafts for forms the user can update', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    prisma.eventForm.findFirst.mockResolvedValue(formRecord());
    prisma.eventFormDraft.findMany.mockResolvedValue([
      draftRecord({ id: 'draft-new', updatedAt: new Date('2026-07-07T11:00:00.000Z') }),
      draftRecord({ id: 'draft-old', updatedAt: new Date('2026-07-06T11:00:00.000Z') }),
    ]);

    const drafts = await service.listDrafts('form-1', authenticatedUser);

    expect(drafts.map((draft) => draft.id)).toEqual(['draft-new', 'draft-old']);
    expect(prisma.eventFormDraft.findMany).toHaveBeenCalledWith({
      where: {
        sourceFormId: 'form-1',
        expiresAt: {
          gt: new Date('2026-07-07T12:00:00.000Z'),
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('soft-deletes forms and links with delete permissions and audit logging', async () => {
    const deletedAt = new Date('2026-07-07T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(deletedAt);
    const existing = formRecord({
      links: [
        linkRecord({ id: 'link-1', eventId: 'event-1' }),
        linkRecord({
          id: 'link-2',
          targetType: EventFormTargetType.MAJOR_EVENT,
          eventId: null,
          majorEventId: 'major-2',
        }),
      ],
    });
    prisma.eventForm.findFirst.mockResolvedValue(existing);
    prisma.eventForm.update.mockResolvedValue(formRecord({ deletedAt }));

    const result = await service.deleteForm('form-1', authenticatedUser);

    expect(result.deletedAt).toEqual(deletedAt);
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Delete],
      { eventFormId: 'form-1' },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Delete],
      { eventId: 'event-1', majorEventId: undefined },
    );
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(
      authenticatedUser,
      [Permission.EventForm.Delete],
      { eventId: undefined, majorEventId: 'major-2' },
    );
    expect(prisma.eventForm.update).toHaveBeenCalledWith({
      where: { id: 'form-1' },
      data: {
        deletedAt,
        updatedById: 'user-1',
        links: {
          updateMany: {
            where: { deletedAt: null },
            data: { deletedAt, updatedById: 'user-1' },
          },
        },
      },
      include: expect.any(Object),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.DELETE,
        entityId: 'form-1',
        summary: 'Formulário "Pesquisa de camiseta" excluído.',
      }),
      prisma,
    );
  });
});

type PrismaMock = {
  $transaction: jest.Mock;
  eventForm: {
    findFirst: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  eventFormLink: {
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  eventFormDraft: {
    create: jest.Mock;
    updateMany: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
  };
};

function createPrisma(): PrismaMock {
  const client: PrismaMock = {
    $transaction: jest.fn(),
    eventForm: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    eventFormLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
    },
    eventFormDraft: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
  };
  client.$transaction.mockImplementation(async (callback: (tx: PrismaMock) => Promise<unknown>) => callback(client));
  return client;
}

function createAuthorizationPolicy() {
  return {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
}

function createAuditLog() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  };
}

function formInput(overrides: Partial<EventFormInput> = {}): EventFormInput {
  return {
    name: 'Pesquisa de camiseta',
    description: null,
    ownerEventId: 'event-1',
    ownerMajorEventId: null,
    elementsJson: '[{"type":"shortText","title":"Nome"}]',
    sigilo: ContractSigilo.SECRET,
    responseMode: ContractResponseMode.ONE_PER_TARGET,
    resultsPublic: false,
    resultsLive: false,
    allowResponseEdits: false,
    links: [],
    ...overrides,
  };
}

function linkInput(overrides: Partial<EventFormLinkInput> = {}): EventFormLinkInput {
  return {
    targetType: EventFormTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    audience: ContractAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: false,
    requiredInSubscriptionFlow: false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: true,
    allowLecturerManualPublish: false,
    ...overrides,
  };
}

function formRecord(
  options: {
    id?: string;
    name?: string;
    description?: string | null;
    ownerEventId?: string | null;
    ownerMajorEventId?: string | null;
    elements?: unknown[];
    sigilo?: EventFormSigilo;
    responseMode?: EventFormResponseMode;
    resultsPublic?: boolean;
    resultsLive?: boolean;
    allowResponseEdits?: boolean;
    publicationState?: PublicationState;
    links?: ReturnType<typeof linkRecord>[];
    deletedAt?: Date | null;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  const ownerEventId = options.ownerEventId === undefined ? 'event-1' : options.ownerEventId;
  const ownerMajorEventId = options.ownerMajorEventId ?? null;

  return {
    id: options.id ?? 'form-1',
    name: options.name ?? 'Pesquisa de camiseta',
    description: options.description ?? null,
    ownerEventId,
    ownerMajorEventId,
    ownerEvent: ownerEventId
      ? {
          id: ownerEventId,
          name: 'Oficina de Angular',
          emoji: 'computer',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
        }
      : null,
    ownerMajorEvent: ownerMajorEventId
      ? {
          id: ownerMajorEventId,
          name: 'Semana da Computação',
          emoji: 'calendar',
        }
      : null,
    elements: options.elements ?? [],
    sigilo: options.sigilo ?? EventFormSigilo.SECRET,
    responseMode: options.responseMode ?? EventFormResponseMode.ONE_PER_TARGET,
    resultsPublic: options.resultsPublic ?? false,
    resultsLive: options.resultsLive ?? false,
    allowResponseEdits: options.allowResponseEdits ?? false,
    publicationState: options.publicationState ?? PublicationState.PUBLISHED,
    scheduledPublishAt: null,
    publishedAt: now,
    unpublishedAt: null,
    publicationScheduledBy: null,
    publicationUpdatedBy: null,
    links: options.links ?? [linkRecord()],
    deletedAt: options.deletedAt ?? null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    _count: {
      responses: 0,
    },
  };
}

function linkRecord(
  options: {
    id?: string;
    formId?: string;
    targetType?: EventFormTargetType;
    eventId?: string | null;
    majorEventId?: string | null;
    audience?: EventFormAudience;
    insertInSubscriptionFlow?: boolean;
    requiredInSubscriptionFlow?: boolean;
    notifyOnPublish?: boolean;
    allowLecturerManualPublish?: boolean;
    deletedAt?: Date | null;
  } = {},
) {
  const now = new Date('2026-06-28T12:00:00.000Z');
  const targetType = options.targetType ?? EventFormTargetType.EVENT;
  const eventId = options.eventId === undefined ? (targetType === EventFormTargetType.EVENT ? 'event-1' : null) : options.eventId;
  const majorEventId = options.majorEventId === undefined ? (targetType === EventFormTargetType.MAJOR_EVENT ? 'major-1' : null) : options.majorEventId;
  return {
    id: options.id ?? 'link-1',
    formId: options.formId ?? 'form-1',
    targetType,
    eventId,
    majorEventId,
    event: eventId
      ? {
          id: eventId,
          name: 'Oficina de Angular',
          emoji: 'computer',
          majorEventId: 'major-1',
          eventGroupId: 'group-1',
        }
      : null,
    majorEvent: majorEventId
      ? {
          id: majorEventId,
          name: 'Semana da Computação',
          emoji: 'calendar',
        }
      : null,
    audience: options.audience ?? EventFormAudience.SUBSCRIBERS_OR_ATTENDEES,
    insertInSubscriptionFlow: options.insertInSubscriptionFlow ?? false,
    requiredInSubscriptionFlow: options.requiredInSubscriptionFlow ?? false,
    enforceRequiredAnswers: true,
    displayOrder: 0,
    availableFrom: null,
    availableUntil: null,
    notifyOnPublish: options.notifyOnPublish ?? false,
    allowLecturerManualPublish: options.allowLecturerManualPublish ?? false,
    lastNotifiedAt: null,
    deletedAt: options.deletedAt ?? null,
    createdAt: now,
    createdById: 'admin-1',
    updatedAt: now,
    updatedById: 'admin-1',
    _count: {
      responses: 0,
    },
  };
}

function draftRecord(
  options: {
    id?: string;
    sourceFormId?: string;
    name?: string;
    payload?: Record<string, unknown>;
    createdById?: string | null;
    updatedById?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    expiresAt?: Date;
  } = {},
) {
  const now = new Date('2026-07-07T12:00:00.000Z');
  return {
    id: options.id ?? 'draft-1',
    sourceFormId: options.sourceFormId ?? 'form-1',
    name: options.name ?? 'Rascunho',
    payload: options.payload ?? { name: options.name ?? 'Rascunho' },
    createdById: options.createdById ?? 'user-1',
    createdByName: 'Ana Silva',
    createdByEmail: 'ana@example.com',
    updatedById: options.updatedById ?? 'user-1',
    updatedByName: 'Ana Silva',
    updatedByEmail: 'ana@example.com',
    createdAt: options.createdAt ?? now,
    updatedAt: options.updatedAt ?? now,
    expiresAt: options.expiresAt ?? new Date('2026-08-06T12:00:00.000Z'),
  };
}
