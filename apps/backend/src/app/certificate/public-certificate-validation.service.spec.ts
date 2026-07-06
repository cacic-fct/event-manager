import { CertificateIssuedTo, CertificateScope, EventType } from '@cacic-fct/shared-data-types';
import { GraphQLISODateTime } from '@nestjs/graphql';
import { PublicCertificateValidationService } from './public-certificate-validation.service';

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

function eventRecord(id: string, name: string, publiclyVisible: boolean, creditMinutes: number) {
  return {
    id,
    name,
    emoji: 'event',
    startDate: new Date('2026-06-01T13:00:00.000Z'),
    endDate: new Date('2026-06-01T14:30:00.000Z'),
    creditMinutes,
    type: EventType.OTHER,
    publiclyVisible,
    publicationState: 'PUBLISHED',
    majorEvent: null,
  };
}
