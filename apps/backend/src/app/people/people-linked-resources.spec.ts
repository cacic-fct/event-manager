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

  it('paginates linked resource pages after building the full group list', async () => {
    const prisma = createPrisma();
    prisma.people.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      name: 'Ana',
      userId: null,
      mergedIntoId: null,
      user: null,
      mergedInto: null,
    });
    prisma.eventAttendance.findMany.mockResolvedValueOnce([
      attendance('event-1', 'Primeira aula'),
      attendance('event-2', 'Segunda aula'),
      attendance('event-3', 'Terceira aula'),
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
  });

  it('detects linked data without querying every table when direct person links exist', async () => {
    const prisma = createPrisma();

    await expect(
      personHasLinkedData(prisma as never, { id: 'person-1', userId: 'user-1', mergedIntoId: null }),
    ).resolves.toBe(true);
    expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
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
    expect(getCertificateRoute({ id: 'config-1', majorEventId: 'major-1' })).toBe(
      '/certificates/major-event/major-1/config-1',
    );
    expect(getPermissionGrantTargetLabel({ eventGroup: { name: 'Minicursos' } })).toBe('Minicursos');
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
