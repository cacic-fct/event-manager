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
      issuedTo: CertificateIssuedTo.ATTENDEE,
      certificateFields: null,
      event,
      eventGroup: null,
      majorEvent: null,
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
