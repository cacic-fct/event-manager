import { createPrismaMock } from './insights-service.fixtures';
import { buildPendingCertificates } from './pending-certificates';

describe('buildPendingCertificates', () => {
  const now = new Date('2026-05-21T12:00:00.000Z');

  it('returns pending certificate items sorted by finish date for every certificate target type', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany
      .mockResolvedValueOnce([
        {
          id: 'pending-event',
          name: 'Pending event',
          endDate: new Date('2026-05-20T10:00:00.000Z'),
          eventGroup: null,
          shouldIssueCertificate: true,
          certificateConfigs: [],
        },
        {
          id: 'configured-event',
          name: 'Configured event',
          endDate: new Date('2026-05-20T08:00:00.000Z'),
          eventGroup: null,
          shouldIssueCertificate: false,
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'lecturer-event',
          name: 'Lecturer event',
          endDate: new Date('2026-05-19T09:00:00.000Z'),
          lecturers: [{ personId: 'lecturer-1' }],
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ]);
    prisma.eventGroup.findMany.mockResolvedValue([
      {
        id: 'pending-group',
        name: 'Pending group',
        shouldIssueCertificate: true,
        events: [{ endDate: new Date('2026-05-18T10:00:00.000Z') }],
        certificateConfigs: [],
      },
    ]);
    prisma.majorEvent.findMany
      .mockResolvedValueOnce([
        {
          id: 'pending-major',
          name: 'Pending major',
          endDate: new Date('2026-05-17T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'pending-major-lecturers',
          name: 'Pending major lecturers',
          endDate: new Date('2026-05-16T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [{ personId: 'lecturer-2' }] }],
          events: [{ lecturers: [{ personId: 'lecturer-1' }] }],
        },
      ]);

    const result = await buildPendingCertificates(prisma as never, now);

    expect(result).toEqual([
      {
        targetType: 'EVENT',
        targetId: 'pending-event',
        title: 'Pending event',
        subtitle: 'Evento finalizado sem certificados emitidos.',
        finishedAt: new Date('2026-05-20T10:00:00.000Z'),
      },
      {
        targetType: 'EVENT',
        targetId: 'configured-event',
        title: 'Configured event',
        subtitle: 'Evento finalizado sem certificados emitidos.',
        finishedAt: new Date('2026-05-20T08:00:00.000Z'),
      },
      {
        targetType: 'EVENT',
        targetId: 'lecturer-event',
        title: 'Lecturer event',
        subtitle: 'Há palestrantes cadastrados no evento sem certificados emitidos.',
        finishedAt: new Date('2026-05-19T09:00:00.000Z'),
      },
      {
        targetType: 'EVENT_GROUP',
        targetId: 'pending-group',
        title: 'Pending group',
        subtitle: 'Grupo finalizado sem certificados emitidos.',
        finishedAt: new Date('2026-05-18T10:00:00.000Z'),
      },
      {
        targetType: 'MAJOR_EVENT',
        targetId: 'pending-major',
        title: 'Pending major',
        subtitle: 'Grande evento finalizado sem certificados emitidos.',
        finishedAt: new Date('2026-05-17T10:00:00.000Z'),
      },
      {
        targetType: 'MAJOR_EVENT_LECTURERS',
        targetId: 'pending-major-lecturers',
        title: 'Pending major lecturers',
        subtitle: 'Há palestrantes cadastrados no grande evento sem certificados emitidos.',
        finishedAt: new Date('2026-05-16T10:00:00.000Z'),
      },
    ]);
  });

  it('does not flag issued certificates, group-owned event certificates, empty lecturer sets, or groups without finished events', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany
      .mockResolvedValueOnce([
        {
          id: 'group-owned-event',
          name: 'Group owned event',
          endDate: new Date('2026-05-20T10:00:00.000Z'),
          eventGroup: {
            shouldIssueCertificate: true,
            certificateConfigs: [],
          },
          shouldIssueCertificate: true,
          certificateConfigs: [],
        },
        {
          id: 'issued-event',
          name: 'Issued event',
          endDate: new Date('2026-05-20T09:00:00.000Z'),
          eventGroup: null,
          shouldIssueCertificate: true,
          certificateConfigs: [{ id: 'config-1', certificates: [{ id: 'certificate-1' }] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'issued-lecturer-event',
          name: 'Issued lecturer event',
          endDate: new Date('2026-05-19T09:00:00.000Z'),
          lecturers: [{ personId: 'lecturer-1' }],
          certificateConfigs: [{ id: 'config-1', certificates: [{ personId: 'lecturer-1' }] }],
        },
        {
          id: 'empty-lecturer-event',
          name: 'Empty lecturer event',
          endDate: new Date('2026-05-19T08:00:00.000Z'),
          lecturers: [],
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
        },
      ]);
    prisma.eventGroup.findMany.mockResolvedValue([
      {
        id: 'empty-group',
        name: 'Empty group',
        shouldIssueCertificate: true,
        events: [],
        certificateConfigs: [],
      },
      {
        id: 'issued-group',
        name: 'Issued group',
        shouldIssueCertificate: true,
        events: [{ endDate: new Date('2026-05-18T10:00:00.000Z') }],
        certificateConfigs: [{ id: 'config-1', certificates: [{ id: 'certificate-1' }] }],
      },
    ]);
    prisma.majorEvent.findMany
      .mockResolvedValueOnce([
        {
          id: 'issued-major',
          name: 'Issued major',
          endDate: new Date('2026-05-17T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [{ id: 'certificate-1' }] }],
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'issued-major-lecturers',
          name: 'Issued major lecturers',
          endDate: new Date('2026-05-16T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [{ personId: 'lecturer-1' }] }],
          events: [{ lecturers: [{ personId: 'lecturer-1' }] }],
        },
        {
          id: 'empty-major-lecturers',
          name: 'Empty major lecturers',
          endDate: new Date('2026-05-15T10:00:00.000Z'),
          certificateConfigs: [{ id: 'config-1', certificates: [] }],
          events: [],
        },
      ]);

    await expect(buildPendingCertificates(prisma as never, now)).resolves.toEqual([]);
  });

  it('returns at most the twelve newest pending certificate items', async () => {
    const prisma = createPrismaMock();
    prisma.event.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 13 }, (_, index) => ({
          id: `event-${index}`,
          name: `Event ${index}`,
          endDate: new Date(Date.UTC(2026, 4, 20, 12, index)),
          eventGroup: null,
          shouldIssueCertificate: true,
          certificateConfigs: [],
        })),
      )
      .mockResolvedValueOnce([]);
    prisma.eventGroup.findMany.mockResolvedValue([]);
    prisma.majorEvent.findMany.mockResolvedValue([]);

    const result = await buildPendingCertificates(prisma as never, now);

    expect(result).toHaveLength(12);
    expect(result[0].targetId).toBe('event-12');
    expect(result[11].targetId).toBe('event-1');
  });
});
