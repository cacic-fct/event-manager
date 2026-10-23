import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { GraphQLISODateTime } from '@nestjs/graphql';
import { PublicCertificateValidationService } from './public-certificate-validation.service';
const { jest } = import.meta;

describe('PublicCertificateValidationService', () => {
  it('does not expose hidden event rows in public certificate validation', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const visibleEvent = eventRecord('visible-event', 'Evento publico', true, 90);
    const hiddenEvent = eventRecord('hidden-event', 'Evento interno', false, 120);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue(certificateRecord(issuedAt, visibleEvent)),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    const result = await service.validateCertificate('certificate-1');

    expect(result?.targetName).toBe('Evento publico');
    expect(result?.issuedAt).toBe(issuedAt);
    expect(GraphQLISODateTime.serialize(result?.issuedAt)).toBe('2026-06-01T12:00:00.000Z');
    expect(result?.sections).toEqual([
      {
        title: 'Evento',
        creditMinutes: 90,
        events: [
          {
            id: 'visible-event',
            name: 'Evento publico',
            emoji: 'event',
            startDate: visibleEvent.startDate,
            endDate: visibleEvent.endDate,
            creditMinutes: 90,
          },
        ],
      },
    ]);
    const [serializedEvent] = result?.sections[0]?.events ?? [];
    expect(GraphQLISODateTime.serialize(serializedEvent?.startDate)).toBe('2026-06-01T13:00:00.000Z');
    expect(GraphQLISODateTime.serialize(serializedEvent?.endDate)).toBe('2026-06-01T14:30:00.000Z');
    expect(result?.totalCreditMinutes).toBe(90);

    prisma.certificate.findFirst.mockResolvedValue(certificateRecord(issuedAt, hiddenEvent));

    const hiddenResult = await service.validateCertificate('certificate-2');

    expect(hiddenResult?.targetName).toBeUndefined();
    expect(hiddenResult?.targetEmoji).toBeUndefined();
    expect(hiddenResult?.sections).toEqual([]);
    expect(hiddenResult?.totalCreditMinutes).toBe(0);
  });

  it('validates standalone certificates with folder target metadata and no credited events', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          config: {
            name: 'Certificado avulso',
            scope: CertificateScope.OTHER,
            isActive: true,
            issuedTo: CertificateIssuedTo.OTHER,
            certificateText: 'Certificamos a atividade complementar.',
            shouldAutofillSecondPage: false,
            secondPageText: 'Texto livre do verso.',
            certificateTypeLabel: 'Atividade complementar',
            certificateFields: null,
            event: null,
            eventGroup: null,
            majorEvent: null,
            folder: {
              id: 'folder-1',
              name: 'Atividades complementares',
              emoji: '🏅',
            },
          },
        }),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('standalone-certificate-1')).resolves.toEqual(
      expect.objectContaining({
        certificateName: 'Certificado avulso',
        scope: CertificateScope.OTHER,
        targetName: 'Atividades complementares',
        targetEmoji: '🏅',
        sections: [],
        totalCreditMinutes: 0,
      }),
    );
  });

  it('does not validate certificates from inactive configs', async () => {
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('disabled-certificate')).resolves.toBeNull();
    expect(prisma.certificate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'disabled-certificate',
          deletedAt: null,
          config: {
            deletedAt: null,
            isActive: true,
          },
        }),
      }),
    );
  });

  it('uses issued rendered data for public certificate text fields', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('visible-event', 'Evento publico', true, 90)),
          renderedData: {
            configText: 'Texto capturado na emissão.',
            certificateTypeLabel: 'Tipo capturado',
            shouldAutofillSecondPage: false,
            secondPageText: 'Verso capturado.',
          },
          config: {
            ...certificateRecord(issuedAt, eventRecord('visible-event', 'Evento publico', true, 90)).config,
            certificateText: 'Texto editado depois.',
            certificateTypeLabel: 'Tipo editado',
            shouldAutofillSecondPage: true,
            secondPageText: 'Verso editado.',
          },
        }),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({
        certificateText: 'Texto capturado na emissão.',
        certificateTypeLabel: 'Tipo capturado',
        shouldAutofillSecondPage: false,
        secondPageText: 'Verso capturado.',
      }),
    );
  });

  it('returns null for blank certificate ids without querying certificates', async () => {
    const prisma = {
      certificate: {
        findFirst: jest.fn(),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('   ')).resolves.toBeNull();

    expect(prisma.certificate.findFirst).not.toHaveBeenCalled();
  });

  it('splits major-event certificates into public event sections and masks valid CPF values', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const minicourse = majorEventEvent('minicourse-1', 'Minicurso de Angular', EventType.MINICURSO, 120);
    const lecture = majorEventEvent('lecture-1', 'Palestra de abertura', EventType.PALESTRA, 60);
    const other = majorEventEvent('other-1', 'Mesa redonda', EventType.OTHER, 45);
    const hidden = majorEventEvent('hidden-1', 'Encontro interno', EventType.PALESTRA, 30, {
      isPubliclyListed: false,
    });
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          person: {
            name: 'Ada Lovelace',
            identityDocument: '529.982.247-25',
            isCPF: true,
          },
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.MAJOR_EVENT,
            event: null,
            majorEvent: {
              id: 'major-1',
              name: 'SECOMP',
              emoji: 'calendar',
              deletedAt: null,
              publicationState: 'PUBLISHED',
            },
          },
        }),
      },
      eventAttendance: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ event: minicourse }, { event: lecture }, { event: other }, { event: hidden }]),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    const result = await service.validateCertificate('certificate-1');

    expect(result).toEqual(
      expect.objectContaining({
        targetName: 'SECOMP',
        targetEmoji: 'calendar',
        maskedIdentityDocument: '•••.982.247-••',
        totalCreditMinutes: 225,
      }),
    );
    expect(result?.sections).toEqual([
      {
        title: 'Minicursos',
        type: EventType.MINICURSO,
        creditMinutes: 120,
        events: [expect.objectContaining({ id: 'minicourse-1', name: 'Minicurso de Angular' })],
      },
      {
        title: 'Palestras',
        type: EventType.PALESTRA,
        creditMinutes: 60,
        events: [expect.objectContaining({ id: 'lecture-1', name: 'Palestra de abertura' })],
      },
      {
        title: 'Outros',
        type: EventType.OTHER,
        creditMinutes: 45,
        events: [expect.objectContaining({ id: 'other-1', name: 'Mesa redonda' })],
      },
    ]);
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'person-1',
          event: expect.objectContaining({
            majorEventId: 'major-1',
            shouldIssueCertificate: true,
          }),
        }),
      }),
    );
  });

  it('does not rederive incomplete event-group attendance for major-event certificates', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const attendedPartially = {
      ...majorEventEvent('group-event-1', 'Oficina incompleta', EventType.MINICURSO, 120),
      eventGroupId: 'group-1',
      eventGroup: {
        shouldIssueCertificate: true,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      },
    };
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          renderedData: {
            events: [],
          },
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.MAJOR_EVENT,
            event: null,
            majorEvent: {
              id: 'major-1',
              name: 'SECOMP',
              emoji: 'calendar',
              deletedAt: null,
              publicationState: 'PUBLISHED',
            },
          },
        }),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([{ event: attendedPartially }]),
      },
      event: {
        findMany: jest.fn(),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({
        sections: [],
        totalCreditMinutes: 0,
      }),
    );
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('uses attended events for partial event-group certificates', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const attended = eventGroupEvent('event-1', 'Oficina prática', 75);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.EVENT_GROUP,
            event: null,
            eventGroup: {
              id: 'group-1',
              name: 'Trilha de oficinas',
              shouldIssueCertificateForEachEvent: false,
              shouldIssuePartialCertificate: true,
            },
          },
        }),
      },
      eventAttendance: {
        findMany: jest.fn().mockResolvedValue([{ event: attended }]),
      },
      eventSubscription: {
        findMany: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({
        targetName: 'Trilha de oficinas',
        sections: [
          {
            title: 'Eventos certificados',
            creditMinutes: 75,
            events: [expect.objectContaining({ id: 'event-1', name: 'Oficina prática' })],
          },
        ],
        totalCreditMinutes: 75,
      }),
    );
    expect(prisma.eventAttendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          personId: 'person-1',
          event: expect.objectContaining({
            eventGroupId: 'group-1',
            shouldIssueCertificate: true,
          }),
        }),
      }),
    );
    expect(prisma.eventSubscription.findMany).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('falls back to all event-group events when there are no active subscriptions', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const groupEvent = eventGroupEvent('event-2', 'Palestra aberta', 50);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.EVENT_GROUP,
            event: null,
            eventGroup: {
              id: 'group-1',
              name: 'Trilha aberta',
              shouldIssueCertificateForEachEvent: false,
              shouldIssuePartialCertificate: false,
            },
          },
        }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([groupEvent]),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    await expect(service.validateCertificate('certificate-1')).resolves.toEqual(
      expect.objectContaining({
        sections: [
          {
            title: 'Eventos certificados',
            creditMinutes: 50,
            events: [expect.objectContaining({ id: 'event-2' })],
          },
        ],
      }),
    );
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          eventGroupId: 'group-1',
          deletedAt: null,
          shouldIssueCertificate: true,
        }),
      }),
    );
  });

  it('filters lecturer certificates by lecturer event ids and configured category', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const lecture = majorEventEvent('lecture-1', 'Palestra ministrada', EventType.PALESTRA, 60);
    const minicourse = majorEventEvent('minicourse-1', 'Minicurso ministrado', EventType.MINICURSO, 120);
    const otherLecturerEvent = majorEventEvent('other-1', 'Mesa redonda ministrada', EventType.OTHER, 45);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.MAJOR_EVENT,
            issuedTo: CertificateIssuedTo.LECTURER,
            certificateFields: {
              __lecturerEventCategory: 'MINICURSO',
            },
            event: null,
            majorEvent: {
              id: 'major-1',
              name: 'SECOMP',
              emoji: 'calendar',
              deletedAt: null,
              publicationState: 'PUBLISHED',
            },
          },
        }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([lecture, minicourse, otherLecturerEvent]),
      },
      eventLecturer: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ eventId: 'lecture-1' }, { eventId: 'minicourse-1' }, { eventId: 'other-1' }]),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    const result = await service.validateCertificate('certificate-1');

    expect(result?.sections).toEqual([
      {
        title: 'Minicursos',
        type: EventType.MINICURSO,
        creditMinutes: 120,
        events: [expect.objectContaining({ id: 'minicourse-1', name: 'Minicurso ministrado' })],
      },
    ]);
    expect(result?.totalCreditMinutes).toBe(120);
    expect(prisma.eventLecturer.findMany).toHaveBeenCalledWith({
      where: {
        personId: 'person-1',
        eventId: {
          in: ['lecture-1', 'minicourse-1', 'other-1'],
        },
      },
      select: {
        eventId: true,
      },
    });
  });

  it('keeps all lecturer event categories for catch-all lecturer certificates', async () => {
    const issuedAt = new Date('2026-06-01T12:00:00.000Z');
    const lecture = majorEventEvent('lecture-1', 'Palestra ministrada', EventType.PALESTRA, 60);
    const minicourse = majorEventEvent('minicourse-1', 'Minicurso ministrado', EventType.MINICURSO, 120);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)),
          config: {
            ...certificateRecord(issuedAt, eventRecord('unused-event', 'Evento publico', true, 90)).config,
            scope: CertificateScope.MAJOR_EVENT,
            issuedTo: CertificateIssuedTo.LECTURER,
            certificateFields: {
              __lecturerEventCategory: 'OTHER',
            },
            event: null,
            majorEvent: {
              id: 'major-1',
              name: 'SECOMP',
              emoji: 'calendar',
              deletedAt: null,
              publicationState: 'PUBLISHED',
            },
          },
        }),
      },
      event: {
        findMany: jest.fn().mockResolvedValue([lecture, minicourse]),
      },
      eventLecturer: {
        findMany: jest.fn().mockResolvedValue([{ eventId: lecture.id }, { eventId: minicourse.id }]),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    const result = await service.validateCertificate('certificate-1');

    expect(result?.sections).toEqual([
      expect.objectContaining({ type: EventType.MINICURSO, creditMinutes: 120 }),
      expect.objectContaining({ type: EventType.PALESTRA, creditMinutes: 60 }),
    ]);
    expect(result?.totalCreditMinutes).toBe(180);
  });

  describe.each([CertificateIssuedTo.OTHER, CertificateIssuedTo.SPORTS_ORGANIZER])('manual role %s', (issuedTo) => {
    it.each(Object.values(CertificateScope))('does not expose target activities for scope %s', async (scope) => {
      const event = eventRecord('event-1', 'Evento público', true, 90);
      const base = certificateRecord(new Date(), event);
      const prisma = {
        certificate: {
          findFirst: jest.fn().mockResolvedValue({
            ...base,
            renderedData: { ...base.renderedData, issuedTo, events: [{ id: event.id }] },
            config: { ...base.config, scope, issuedTo },
          }),
        },
        event: { findMany: jest.fn().mockResolvedValue([event]) },
        eventAttendance: { findMany: jest.fn().mockResolvedValue([{ event }]) },
      };
      const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

      for (const renderedData of [
        { ...base.renderedData, issuedTo, events: [{ id: event.id }] },
        { ...base.renderedData, issuedTo },
      ]) {
        prisma.certificate.findFirst.mockResolvedValue({
          ...base,
          renderedData,
          config: { ...base.config, scope, issuedTo },
        });
        await expect(service.validateCertificate(base.id)).resolves.toEqual(
          expect.objectContaining({
            issuedTo,
            sections: [],
            totalCreditMinutes: 0,
          }),
        );
      }
      expect(prisma.event.findMany).not.toHaveBeenCalled();
      expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
    });
  });

  it('keeps issued identity, role, target, and event details after live records change', async () => {
    const issuedAt = new Date();
    const startDate = new Date(issuedAt.getTime() - 3_600_000);
    const endDate = new Date(issuedAt.getTime() - 1_800_000);
    const event = eventRecord('event-1', 'Nome alterado', true, 180);
    const base = certificateRecord(issuedAt, event);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          person: { name: 'Nome alterado', identityDocument: null, isCPF: null },
          config: { ...base.config, name: 'Configuração alterada', issuedTo: CertificateIssuedTo.OTHER },
          renderedData: {
            scope: CertificateScope.EVENT,
            issuedTo: CertificateIssuedTo.ATTENDEE,
            configName: 'Certificado emitido',
            person: { name: 'Nome na emissão', identityDocument: '529.982.247-25' },
            target: { id: event.id, name: 'Evento na emissão' },
            events: [
              {
                id: event.id,
                name: 'Atividade na emissão',
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                creditMinutes: 30,
                type: EventType.PALESTRA,
              },
            ],
          },
        }),
      },
      event: { findMany: jest.fn().mockResolvedValue([event]) },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);

    const result = await service.validateCertificate(base.id);

    expect(result).toEqual(
      expect.objectContaining({
        personName: 'Nome na emissão',
        maskedIdentityDocument: '•••.982.247-••',
        certificateName: 'Certificado emitido',
        scope: CertificateScope.EVENT,
        issuedTo: CertificateIssuedTo.ATTENDEE,
        targetName: 'Evento na emissão',
        totalCreditMinutes: 30,
      }),
    );
    expect(result?.sections[0].events).toEqual([
      expect.objectContaining({
        id: event.id,
        name: 'Atividade na emissão',
        startDate,
        endDate,
        creditMinutes: 30,
      }),
    ]);

    // Snapshots must never bypass the current publication/deletion policy.
    for (const hiddenEvent of [
      { ...event, isPubliclyListed: false },
      { ...event, publicationState: 'DRAFT' },
      { ...event, deletedAt: new Date() },
    ]) {
      prisma.event.findMany.mockResolvedValue([hiddenEvent]);
      const hiddenResult = await service.validateCertificate(base.id);
      expect(hiddenResult?.sections).toEqual([]);
      expect(hiddenResult?.totalCreditMinutes).toBe(0);
    }
  });

  it('keeps a public event-group target for manual certificates without crediting its events', async () => {
    const base = certificateRecord(new Date(), eventRecord('event-1', 'Evento público', true, 90));
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          renderedData: { issuedTo: CertificateIssuedTo.OTHER, events: [{ id: 'event-1' }] },
          config: {
            ...base.config,
            scope: CertificateScope.EVENT_GROUP,
            event: null,
            eventGroup: { id: 'group-1', name: 'Grupo público', events: [{ id: 'event-1' }] },
          },
        }),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);
    await expect(service.validateCertificate(base.id)).resolves.toEqual(
      expect.objectContaining({
        targetName: 'Grupo público',
        sections: [],
        totalCreditMinutes: 0,
      }),
    );
  });

  it('uses the issued manual role even when the config becomes automatic', async () => {
    const base = certificateRecord(new Date(), eventRecord('event-1', 'Evento público', true, 90));
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          renderedData: { issuedTo: CertificateIssuedTo.OTHER, events: [{ id: 'event-1' }] },
        }),
      },
      event: { findMany: jest.fn() },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);
    await expect(service.validateCertificate(base.id)).resolves.toEqual(
      expect.objectContaining({
        issuedTo: CertificateIssuedTo.OTHER,
        sections: [],
        totalCreditMinutes: 0,
      }),
    );
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('does not label legacy sports certificates with ordinary attendance', async () => {
    const base = certificateRecord(new Date(), eventRecord('event-1', 'Partida', true, 90));
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          config: { ...base.config, issuedTo: CertificateIssuedTo.SPORTS_PLAYER },
        }),
      },
      eventAttendance: { findMany: jest.fn() },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);
    await expect(service.validateCertificate(base.id)).resolves.toEqual(expect.objectContaining({ sections: [] }));
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
  });

  it('does not replace the issued target with a different configuration target', async () => {
    const base = certificateRecord(new Date(), eventRecord('new-event', 'Outro evento', true, 90));
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          renderedData: { target: { id: 'original-event', name: 'Evento original' }, events: [] },
        }),
      },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);
    const result = await service.validateCertificate(base.id);
    expect(result?.targetName).toBeUndefined();
    expect(result?.targetEmoji).toBeUndefined();
  });

  it('deduplicates issued events and tolerates invalid legacy snapshot fields', async () => {
    const event = eventRecord('event-1', 'Evento público', true, 90);
    const base = certificateRecord(new Date(), event);
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({
          ...base,
          renderedData: {
            scope: 'INVALID',
            issuedTo: 'INVALID',
            person: [],
            events: [
              null,
              { id: '' },
              { id: event.id, startDate: 'invalid', type: 'INVALID', creditMinutes: -1 },
              { id: event.id, name: 'Duplicado' },
            ],
          },
        }),
      },
      event: { findMany: jest.fn().mockResolvedValue([event]) },
    };
    const service = new PublicCertificateValidationService(prisma as never, validationService() as never);
    const result = await service.validateCertificate(base.id);
    expect(result?.totalCreditMinutes).toBe(90);
    expect(result?.sections[0].events).toEqual([
      expect.objectContaining({
        id: event.id,
        name: event.name,
        startDate: event.startDate,
        creditMinutes: event.creditMinutes,
      }),
    ]);
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [event.id] }, deletedAt: null },
      }),
    );
  });
});

function validationService() {
  return {
    normalizeOptionalId: jest.fn((id: string | null | undefined) => id?.trim() || null),
  };
}

function certificateRecord(issuedAt: Date, event: ReturnType<typeof eventRecord>) {
  return {
    id: 'certificate-1',
    issuedAt,
    renderedData: {
      configText: 'Certificamos a participação.',
      certificateTypeLabel: 'Participação',
      shouldAutofillSecondPage: true,
      secondPageText: null,
    },
    personId: 'person-1',
    person: {
      name: 'Ada Lovelace',
      identityDocument: null,
      isCPF: null,
    },
    config: {
      name: 'Certificado',
      scope: CertificateScope.EVENT,
      isActive: true,
      issuedTo: CertificateIssuedTo.ATTENDEE,
      certificateText: 'Certificamos a participação.',
      shouldAutofillSecondPage: true,
      secondPageText: null,
      certificateTypeLabel: 'Participação',
      certificateFields: null,
      event,
      eventGroup: null,
      majorEvent: null,
      folder: null,
    },
  };
}

function eventRecord(id: string, name: string, isPubliclyListed: boolean, creditMinutes: number) {
  return {
    id,
    name,
    emoji: 'event',
    startDate: new Date('2026-06-01T13:00:00.000Z'),
    endDate: new Date('2026-06-01T14:30:00.000Z'),
    creditMinutes,
    type: EventType.OTHER,
    isPubliclyListed,
    publicationState: 'PUBLISHED',
    majorEventId: null,
    majorEvent: null,
  };
}

function majorEventEvent(
  id: string,
  name: string,
  type: EventType,
  creditMinutes: number,
  overrides: Partial<ReturnType<typeof eventRecord>> = {},
) {
  return {
    ...eventRecord(id, name, true, creditMinutes),
    type,
    majorEventId: 'major-1',
    majorEvent: {
      deletedAt: null,
      publicationState: 'PUBLISHED',
    },
    ...overrides,
  };
}

function eventGroupEvent(id: string, name: string, creditMinutes: number) {
  return {
    ...eventRecord(id, name, true, creditMinutes),
    type: EventType.PALESTRA,
  };
}
