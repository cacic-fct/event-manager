import {
  toCertificateTemplateSearchDocument,
  toMajorEventSearchDocument,
  toPersonSearchDocument,
  toPlacePresetSearchDocument,
} from './typesense-search.documents';

describe('typesense generic document mappers', () => {
  it('maps major events with timestamps and draft fallback', () => {
    expect(
      toMajorEventSearchDocument({
        id: 'major-1',
        name: 'Semana',
        description: '  Descricao  ',
        startDate: new Date('2026-06-25T12:00:00.000Z'),
        endDate: new Date('2026-06-25T13:00:00.000Z'),
      }),
    ).toEqual({
      id: 'major-1',
      name: 'Semana',
      description: 'Descricao',
      startDate: 1782388800,
      endDate: 1782392400,
      publicationState: 'DRAFT',
    });
  });

  it('maps people, places, and certificate templates with trimmed optional values', () => {
    expect(
      toPersonSearchDocument({
        id: 'person-1',
        name: 'Ana',
        email: ' ana@example.com ',
        secondaryEmails: ['sec@example.com', ''],
        phone: '',
        identityDocument: ' 123 ',
      }),
    ).toEqual({
      id: 'person-1',
      name: 'Ana',
      email: 'ana@example.com',
      secondaryEmails: ['sec@example.com'],
      phone: undefined,
      identityDocument: '123',
      academicId: undefined,
      userId: undefined,
    });
    expect(toPlacePresetSearchDocument({ id: 'place-1', name: 'Lab', locationDescription: ' Sala 1 ' })).toEqual({
      id: 'place-1',
      name: 'Lab',
      locationDescription: 'Sala 1',
    });
    expect(
      toCertificateTemplateSearchDocument({
        id: 'template-1',
        name: 'Certificado',
        description: '  ',
        version: 2,
        isActive: true,
      }),
    ).toEqual({
      id: 'template-1',
      name: 'Certificado',
      description: undefined,
      version: 2,
      isActive: true,
    });
  });
});
