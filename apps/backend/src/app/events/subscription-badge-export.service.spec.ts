import { BadRequestException } from '@nestjs/common';
import { buildBadgeCodeRelativePath, SubscriptionBadgeExportService } from './subscription-badge-export.service';

describe('SubscriptionBadgeExportService', () => {
  const validInput = {
    fields: ['fullName'] as const,
    identityDocumentMode: 'masked' as const,
    errorCorrectionLevel: '35',
    format: 'svg' as const,
    fileName: 'id' as const,
  };

  it('fails before opening a response stream when a subscriber has no wallet user id', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', name: 'Evento de teste' }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            person: {
              id: 'person-1',
              name: 'Ana',
              email: null,
              phone: null,
              identityDocument: null,
              academicId: null,
              userId: null,
              user: null,
            },
          },
        ]),
      },
    };
    const service = new SubscriptionBadgeExportService(prisma as never);

    await expect(service.exportEvent('event-1', validInput)).rejects.toThrow(BadRequestException);
    expect(prisma.eventSubscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects an error-correction level outside the supported Aztec range', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', name: 'Evento de teste' }),
      },
    };
    const service = new SubscriptionBadgeExportService(prisma as never);

    await expect(service.exportEvent('event-1', { ...validInput, errorCorrectionLevel: '96' })).rejects.toThrow(
      'nível de correção de erros',
    );
  });

  it('uses normalized identity documents only to distinguish namesake file names', () => {
    const input = { fileName: 'fullName' as const, format: 'svg' as const };
    const duplicateNames = new Set(['ana-silva']);
    const seen = new Map<string, number>();

    expect(
      buildBadgeCodeRelativePath(
        { id: 'person-1', name: 'Ana Silva', identityDocument: '123.456.789-09' },
        input,
        duplicateNames,
        seen,
      ),
    ).toBe('codigos/ana-silva-12345678909.svg');
    expect(
      buildBadgeCodeRelativePath(
        { id: 'person-2', name: 'Bia Silva', identityDocument: 'AB-123' },
        input,
        duplicateNames,
        seen,
      ),
    ).toBe('codigos/bia-silva.svg');
  });

  it('requires an identity document when a namesake needs a suffix', async () => {
    const prisma = {
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'event-1', name: 'Evento de teste' }),
      },
      eventSubscription: {
        findMany: jest.fn().mockResolvedValue([
          personSubscription({ id: 'person-1', name: 'Ana Silva', identityDocument: '123.456.789-09' }),
          personSubscription({ id: 'person-2', name: 'ANA SILVA', identityDocument: null }),
        ]),
      },
    };
    const service = new SubscriptionBadgeExportService(prisma as never);

    await expect(service.exportEvent('event-1', { ...validInput, fileName: 'fullName' })).rejects.toThrow(
      'documento não informado',
    );
  });

});

function personSubscription({
  id,
  name,
  identityDocument,
}: {
  id: string;
  name: string;
  identityDocument: string | null;
}) {
  return {
    person: {
      id,
      name,
      email: null,
      phone: null,
      identityDocument,
      academicId: null,
      userId: 'user-1',
      user: null,
    },
  };
}
