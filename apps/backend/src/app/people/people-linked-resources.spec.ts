import { NotFoundException } from '@nestjs/common';
import {
  buildPersonLinkedDataSummary,
  buildPersonLinkedResourcePage,
  personHasLinkedData,
} from './people-linked-resources';
import { countPersonLinkedResourceGroups } from './people-linked-resource-counts';
import {
  buildLinkedGroup,
  getCertificateRoute,
  getCertificateTargetLabel,
  getLinkedResourceGroupDefinition,
  getPermissionGrantTargetLabel,
  normalizeLinkedResourceGroups,
} from './people-linked-resource-definitions';

describe('people linked resources', () => {
  it('summarizes linked resource counts and only allows deletion without links', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({ id: 'person-1', userId: 'user-1', mergedIntoId: null });
    prisma.eventSubscription.count.mockResolvedValueOnce(2);

    const summary = await buildPersonLinkedDataSummary(prisma as never, 'person-1', true);

    expect(summary).toEqual(
      expect.objectContaining({
        personId: 'person-1',
        totalCount: 3,
        hasLinkedData: true,
        canDelete: false,
      }),
    );
    expect(summary.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'USER', totalCount: 1 }),
        expect.objectContaining({ type: 'SUBSCRIPTION', totalCount: 2 }),
      ]),
    );
  });

  it('reports deletable people when no linked data exists', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({ id: 'person-1', userId: null, mergedIntoId: null });

    await expect(buildPersonLinkedDataSummary(prisma as never, 'person-1', true)).resolves.toEqual(
      expect.objectContaining({
        totalCount: 0,
        hasLinkedData: false,
        canDelete: true,
      }),
    );
  });

  it('throws when the person does not exist', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce(null);

    await expect(buildPersonLinkedDataSummary(prisma as never, 'missing-person', true)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('paginates linked resource pages with a direct type query', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      name: 'Ana',
      userId: null,
      mergedIntoId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventAttendance.count.mockResolvedValueOnce(3);
    prisma.eventAttendance.findMany.mockResolvedValueOnce([
      attendance('event-2', 'Segunda aula'),
    ]);

    const page = await buildPersonLinkedResourcePage(prisma as never, 'person-1', 'ATTENDANCE', 1, 1);

    expect(page).toEqual(
      expect.objectContaining({
        personId: 'person-1',
        type: 'ATTENDANCE',
        total: 3,
        skip: 1,
        take: 1,
        items: [
          expect.objectContaining({
            id: 'person-1:event-2',
            label: 'Segunda aula',
            route: '/attendances/event/event-2',
          }),
        ],
      }),
    );
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 1, take: 1 }));
  });

  it('throws when a linked resource page is requested for a missing person', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce(null);

    await expect(buildPersonLinkedResourcePage(prisma as never, 'missing-person', 'USER')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('detects linked data without querying every table when direct person links exist', async () => {
    const prisma = createPrisma();

    await expect(
      personHasLinkedData(prisma as never, { id: 'person-1', userId: 'user-1', mergedIntoId: null }),
    ).resolves.toBe(true);
    expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
  });

  it('probes every linked data source before reporting a person as unlinkable', async () => {
    const prisma = createPrisma();

    await expect(
      personHasLinkedData(prisma as never, { id: 'person-1', userId: null, mergedIntoId: null }),
    ).resolves.toBe(false);

    expect(prisma.certificate.findFirst).toHaveBeenCalledWith({
      where: { personId: 'person-1', deletedAt: null },
      select: { id: true },
    });
    expect(prisma.majorEventReceipt.findFirst).toHaveBeenCalledWith({
      where: { personId: 'person-1' },
      select: { id: true },
    });
  });

  it('formats singleton user and lecturer profile linked resource pages', async () => {
    const prisma = createPrisma();
    const updatedAt = new Date('2026-07-02T12:00:00.000Z');
    prisma.people.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        userId: 'user-1',
        user: {
          id: 'user-1',
          email: 'ana@example.com',
          name: 'Ana',
          updatedAt,
        },
        mergedInto: null,
      })
      .mockResolvedValueOnce({
        id: 'person-1',
        userId: null,
        user: null,
        mergedInto: null,
      });
    prisma.lecturerProfile.findUnique.mockResolvedValueOnce({
      id: 'lecturer-profile-1',
      displayName: 'Profa. Ana',
      updatedAt,
    });

    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'USER', 0, 10)).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'user-1',
            label: 'Ana',
            description: 'ana@example.com',
            route: '/people/person-1',
            occurredAt: updatedAt,
          }),
        ],
      }),
    );
    await expect(
      buildPersonLinkedResourcePage(prisma as never, 'person-1', 'LECTURER_PROFILE', 0, 10),
    ).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'lecturer-profile-1',
            label: 'Profa. Ana',
            route: '/people/person-1',
            occurredAt: updatedAt,
          }),
        ],
      }),
    );
  });

  it('formats certificate, offline submission, receipt, and permission grant pages', async () => {
    const prisma = createPrisma();
    const occurredAt = new Date('2026-07-03T12:00:00.000Z');
    prisma.people.findFirst.mockResolvedValue({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: null,
    });
    prisma.certificate.count.mockResolvedValueOnce(1);
    prisma.certificate.findMany.mockResolvedValueOnce([
      {
        id: 'certificate-1',
        issuedAt: occurredAt,
        config: {
          id: 'config-1',
          name: 'Certificado',
          scope: 'EVENT',
          eventId: 'event-1',
          eventGroupId: null,
          majorEventId: null,
          event: { id: 'event-1', name: 'Credenciamento' },
          eventGroup: null,
          majorEvent: null,
        },
      },
    ]);
    prisma.offlineEventAttendanceSubmission.count.mockResolvedValueOnce(1);
    prisma.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      {
        id: 'submission-1',
        eventId: 'event-1',
        submittedAt: occurredAt,
        status: 'PENDING',
        event: { id: 'event-1', name: 'Credenciamento' },
      },
    ]);
    prisma.majorEventReceipt.count.mockResolvedValueOnce(1);
    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      {
        id: 'receipt-1',
        fileName: 'receipt.pdf',
        processingStatus: 'APPROVED',
        uploadedAt: occurredAt,
        subscription: { majorEventId: 'major-1' },
      },
    ]);
    prisma.eventManagerPermissionGrant.count.mockResolvedValueOnce(1);
    prisma.eventManagerPermissionGrant.findMany.mockResolvedValueOnce([
      {
        id: 'grant-1',
        permission: 'EVENT_MANAGER',
        scope: 'EVENT',
        createdAt: occurredAt,
        event: { id: 'event-1', name: 'Credenciamento' },
        eventGroup: null,
        majorEvent: null,
      },
    ]);

    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'CERTIFICATE')).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'certificate-1',
            label: 'Certificado',
            description: 'Evento: Credenciamento',
            route: '/certificates/event/event-1/config-1',
          }),
        ],
      }),
    );
    await expect(
      buildPersonLinkedResourcePage(prisma as never, 'person-1', 'OFFLINE_ATTENDANCE_SUBMISSION'),
    ).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'submission-1',
            label: 'Credenciamento',
            route: '/attendances/event/event-1',
            status: 'PENDING',
          }),
        ],
      }),
    );
    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'RECEIPT')).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'receipt-1',
            label: 'receipt.pdf',
            route: '/subscriptions/major-event/major-1/validate-receipts',
            status: 'APPROVED',
          }),
        ],
      }),
    );
    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'PERMISSION_GRANT')).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'grant-1',
            label: 'EVENT_MANAGER',
            description: 'Credenciamento',
            route: '/people/person-1',
            status: 'EVENT',
          }),
        ],
      }),
    );
  });

  it('paginates segmented subscription pages across event, group, and major-event segments', async () => {
    const prisma = createPrisma();
    const createdAt = new Date('2026-07-04T12:00:00.000Z');
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventSubscription.count.mockResolvedValueOnce(1);
    prisma.eventGroupSubscription.count.mockResolvedValueOnce(1);
    prisma.majorEventSubscription.count.mockResolvedValueOnce(1);
    prisma.eventGroupSubscription.findMany.mockResolvedValueOnce([
      {
        id: 'event-group-subscription-1',
        eventGroupId: 'group-1',
        createdAt,
        eventGroup: { id: 'group-1', name: 'Minicursos' },
      },
    ]);
    prisma.majorEventSubscription.findMany.mockResolvedValueOnce([
      {
        id: 'major-event-subscription-1',
        majorEventId: 'major-1',
        subscriptionStatus: 'CONFIRMED',
        updatedAt: createdAt,
        majorEvent: { id: 'major-1', name: 'SECOMP', startDate: createdAt },
      },
    ]);

    const page = await buildPersonLinkedResourcePage(prisma as never, 'person-1', 'SUBSCRIPTION', 1, 2);

    expect(page).toEqual(
      expect.objectContaining({
        total: 3,
        items: [
          expect.objectContaining({
            id: 'event-group-subscription-1',
            label: 'Minicursos',
            route: '/groups/group-1',
          }),
          expect.objectContaining({
            id: 'major-event-subscription-1',
            label: 'SECOMP',
            route: '/subscriptions/major-event/major-1',
            status: 'CONFIRMED',
          }),
        ],
      }),
    );
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.eventGroupSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
    expect(prisma.majorEventSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 1 }));
  });

  it('formats the event subscription segment when it is inside the requested page', async () => {
    const prisma = createPrisma();
    const createdAt = new Date('2026-07-04T12:00:00.000Z');
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventSubscription.count.mockResolvedValueOnce(1);
    prisma.eventGroupSubscription.count.mockResolvedValueOnce(0);
    prisma.majorEventSubscription.count.mockResolvedValueOnce(0);
    prisma.eventSubscription.findMany.mockResolvedValueOnce([
      {
        id: 'event-subscription-1',
        eventId: 'event-1',
        createdAt,
        event: { id: 'event-1', name: 'Credenciamento', startDate: createdAt },
      },
    ]);

    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'SUBSCRIPTION', 0, 1)).resolves.toEqual(
      expect.objectContaining({
        total: 1,
        items: [
          expect.objectContaining({
            id: 'event-subscription-1',
            label: 'Credenciamento',
            route: '/subscriptions/event/event-1',
          }),
        ],
      }),
    );
  });

  it('formats event relation lecturer and collector segments', async () => {
    const prisma = createPrisma();
    const createdAt = new Date('2026-07-04T12:00:00.000Z');
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventLecturer.count.mockResolvedValueOnce(1);
    prisma.eventAttendanceCollector.count.mockResolvedValueOnce(1);
    prisma.eventLecturer.findMany.mockResolvedValueOnce([
      {
        personId: 'person-1',
        eventId: 'event-1',
        createdAt,
        event: { id: 'event-1', name: 'Palestra', startDate: createdAt },
      },
    ]);
    prisma.eventAttendanceCollector.findMany.mockResolvedValueOnce([
      {
        personId: 'person-1',
        eventId: 'event-2',
        createdAt,
        event: { id: 'event-2', name: 'Credenciamento', startDate: createdAt },
      },
    ]);

    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'EVENT_RELATION', 0, 2)).resolves.toEqual(
      expect.objectContaining({
        total: 2,
        items: [
          expect.objectContaining({
            id: 'event-1:person-1:lecturer',
            label: 'Palestra',
            route: '/events/event-1',
          }),
          expect.objectContaining({
            id: 'event-2:person-1:collector',
            label: 'Credenciamento',
            route: '/events/event-2',
          }),
        ],
      }),
    );
  });

  it('counts segmented pages without fetching rows when take resolves to zero', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventSubscription.count.mockResolvedValueOnce(1);
    prisma.eventGroupSubscription.count.mockResolvedValueOnce(1);
    prisma.majorEventSubscription.count.mockResolvedValueOnce(1);

    await expect(buildPersonLinkedResourcePage(prisma as never, 'person-1', 'SUBSCRIPTION', 0, 0)).resolves.toEqual(
      expect.objectContaining({
        total: 3,
        items: [],
        take: 0,
      }),
    );
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.eventGroupSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEventSubscription.findMany).not.toHaveBeenCalled();
  });

  it('formats merge linked resources across every merge segment', async () => {
    const prisma = createPrisma();
    const updatedAt = new Date('2026-07-05T12:00:00.000Z');
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      userId: null,
      user: null,
      mergedInto: { id: 'target-person', name: 'Cadastro principal' },
    });
    prisma.people.count.mockResolvedValueOnce(1);
    prisma.people.findMany.mockResolvedValueOnce([
      {
        id: 'source-person',
        name: 'Cadastro antigo',
        updatedAt,
      },
    ]);
    prisma.mergeCandidate.count.mockResolvedValueOnce(1);
    prisma.mergeCandidate.findMany.mockResolvedValueOnce([
      {
        id: 'candidate-1',
        status: 'PENDING',
        matchValue: 'ana@example.com',
        matchMethod: 'EMAIL',
        updatedAt,
      },
    ]);
    prisma.peopleMergeOperation.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    prisma.peopleMergeOperation.findMany
      .mockResolvedValueOnce([
        {
          id: 'operation-target',
          status: 'APPLIED',
          createdAt: updatedAt,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'operation-source',
          status: 'ROLLED_BACK',
          createdAt: updatedAt,
        },
      ]);

    const page = await buildPersonLinkedResourcePage(prisma as never, 'person-1', 'MERGE', 0, 5);

    expect(page).toEqual(
      expect.objectContaining({
        total: 5,
        items: [
          expect.objectContaining({ id: 'person-1:merged-into:target-person', route: '/people/target-person' }),
          expect.objectContaining({ id: 'source-person:merged-from:person-1', route: '/people/source-person' }),
          expect.objectContaining({ id: 'candidate-1', route: '/merge-candidates', status: 'PENDING' }),
          expect.objectContaining({ id: 'operation-target:target', status: 'APPLIED' }),
          expect.objectContaining({ id: 'operation-source:source', status: 'ROLLED_BACK' }),
        ],
      }),
    );
  });

  it('counts every linked resource category with grouped subscription and merge totals', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({ id: 'person-1', userId: null, mergedIntoId: 'target-person' });
    prisma.certificate.count.mockResolvedValueOnce(1);
    prisma.eventSubscription.count.mockResolvedValueOnce(2);
    prisma.eventGroupSubscription.count.mockResolvedValueOnce(3);
    prisma.majorEventSubscription.count.mockResolvedValueOnce(4);
    prisma.eventAttendance.count.mockResolvedValueOnce(5);
    prisma.eventLecturer.count.mockResolvedValueOnce(6);
    prisma.eventAttendanceCollector.count.mockResolvedValueOnce(7);
    prisma.offlineEventAttendanceSubmission.count.mockResolvedValueOnce(8);
    prisma.eventManagerPermissionGrant.count.mockResolvedValueOnce(9);
    prisma.lecturerProfile.findUnique.mockResolvedValueOnce({ id: 'lecturer-profile-1' });
    prisma.people.count.mockResolvedValueOnce(10);
    prisma.mergeCandidate.count.mockResolvedValueOnce(11);
    prisma.peopleMergeOperation.count.mockResolvedValueOnce(12).mockResolvedValueOnce(13);
    prisma.majorEventReceipt.count.mockResolvedValueOnce(14);

    await expect(countPersonLinkedResourceGroups(prisma as never, 'person-1')).resolves.toEqual({
      USER: 0,
      CERTIFICATE: 1,
      SUBSCRIPTION: 9,
      ATTENDANCE: 5,
      EVENT_RELATION: 13,
      OFFLINE_ATTENDANCE_SUBMISSION: 8,
      RECEIPT: 14,
      LECTURER_PROFILE: 1,
      PERMISSION_GRANT: 9,
      MERGE: 47,
    });
  });

  it('formats linked-resource definitions, certificate routes, and permission target labels', () => {
    expect(getLinkedResourceGroupDefinition('CERTIFICATE')).toEqual(
      expect.objectContaining({ label: 'Certificados', icon: 'workspace_premium' }),
    );
    expect(() => getLinkedResourceGroupDefinition('UNKNOWN')).toThrow(NotFoundException);
    expect(
      normalizeLinkedResourceGroups([
        buildLinkedGroup('EMPTY', 'Vazio', 'block', []),
        buildLinkedGroup('CERTIFICATE', 'Certificados', 'workspace_premium', [
          { id: 'certificate-1', label: 'Certificado', description: null, route: null },
        ]),
      ]),
    ).toEqual([
      {
        type: 'CERTIFICATE',
        label: 'Certificados',
        icon: 'workspace_premium',
        totalCount: 1,
        items: [{ id: 'certificate-1', label: 'Certificado', description: null, route: null }],
      },
    ]);
    expect(
      getCertificateTargetLabel({
        scope: 'EVENT',
        event: { name: 'Credenciamento' },
      }),
    ).toBe('Evento: Credenciamento');
    expect(getCertificateTargetLabel({ scope: 'EVENT_GROUP', eventGroup: { name: 'Minicursos' } })).toBe(
      'Grupo de eventos: Minicursos',
    );
    expect(getCertificateTargetLabel({ scope: 'MAJOR_EVENT', majorEvent: { name: 'SECOMP' } })).toBe(
      'Grande evento: SECOMP',
    );
    expect(getCertificateTargetLabel({ scope: 'GLOBAL' })).toBe('GLOBAL');
    expect(getCertificateRoute({ id: 'config-1', eventId: 'event-1' })).toBe(
      '/certificates/event/event-1/config-1',
    );
    expect(getCertificateRoute({ id: 'config-1', eventGroupId: 'group-1' })).toBe(
      '/certificates/event-group/group-1/config-1',
    );
    expect(getCertificateRoute({ id: 'config-1', majorEventId: 'major-1' })).toBe(
      '/certificates/major-event/major-1/config-1',
    );
    expect(getCertificateRoute({ id: 'config-1' })).toBe('/certificates');
    expect(getPermissionGrantTargetLabel({ event: { name: 'Credenciamento' } })).toBe('Credenciamento');
    expect(getPermissionGrantTargetLabel({ eventGroup: { name: 'Minicursos' } })).toBe('Minicursos');
    expect(getPermissionGrantTargetLabel({ majorEvent: { name: 'SECOMP' } })).toBe('SECOMP');
    expect(getPermissionGrantTargetLabel({})).toBe('Escopo global');
  });
});

function createPrisma() {
  const linkedModel = () => ({
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  });

  return {
    people: {
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    certificate: linkedModel(),
    eventSubscription: linkedModel(),
    eventGroupSubscription: linkedModel(),
    majorEventSubscription: linkedModel(),
    eventAttendance: linkedModel(),
    eventLecturer: linkedModel(),
    eventAttendanceCollector: linkedModel(),
    offlineEventAttendanceSubmission: linkedModel(),
    eventManagerPermissionGrant: linkedModel(),
    lecturerProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    mergeCandidate: linkedModel(),
    peopleMergeOperation: linkedModel(),
    majorEventReceipt: linkedModel(),
  };
}

function attendance(eventId: string, name: string) {
  return {
    personId: 'person-1',
    eventId,
    attendedAt: new Date('2026-07-01T12:00:00.000Z'),
    category: 'REGULAR',
    event: {
      id: eventId,
      name,
      startDate: new Date('2026-07-01T12:00:00.000Z'),
    },
  };
}
