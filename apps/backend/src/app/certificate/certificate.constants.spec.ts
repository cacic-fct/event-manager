import { CertificateScope } from '@cacic-fct/shared-data-types';
import {
  buildConfigTargetWhere,
  mapCertificate,
  mapCertificateConfig,
  mapCertificateTemplate,
} from './certificate.constants';

describe('certificate constants', () => {
  it('builds scoped certificate config filters', () => {
    expect(buildConfigTargetWhere(CertificateScope.EVENT, 'event-1')).toEqual({
      scope: CertificateScope.EVENT,
      eventId: 'event-1',
    });
    expect(buildConfigTargetWhere(CertificateScope.EVENT_GROUP, 'group-1')).toEqual({
      scope: CertificateScope.EVENT_GROUP,
      eventGroupId: 'group-1',
    });
    expect(buildConfigTargetWhere(CertificateScope.MAJOR_EVENT, 'major-1')).toEqual({
      scope: CertificateScope.MAJOR_EVENT,
      majorEventId: 'major-1',
    });
    expect(buildConfigTargetWhere(CertificateScope.OTHER, 'ignored')).toEqual({
      scope: CertificateScope.OTHER,
    });
  });

  it('maps nullable certificate template fields to optional API fields', () => {
    expect(mapCertificateTemplate(certificateTemplateRecord({ certificateFields: { name: '{{name}}' } }))).toEqual(
      expect.objectContaining({
        id: 'template-1',
        description: undefined,
        certificateFieldsJson: '{"name":"{{name}}"}',
        createdById: undefined,
        updatedById: undefined,
        deletedAt: undefined,
      }),
    );
  });

  it('maps certificate configs with nested targets and templates', () => {
    expect(mapCertificateConfig(certificateConfigRecord())).toEqual(
      expect.objectContaining({
        id: 'config-1',
        majorEventId: undefined,
        eventGroupId: undefined,
        eventId: 'event-1',
        eventGroup: undefined,
        certificateTemplate: expect.objectContaining({ id: 'template-1' }),
        certificateText: undefined,
        secondPageText: 'Second page',
        certificateFieldsJson: undefined,
        createdById: undefined,
        updatedById: 'user-2',
        deletedAt: undefined,
      }),
    );
  });

  it('maps certificates with rendered data and nested config/template records', () => {
    expect(mapCertificate(certificateRecord())).toEqual(
      expect.objectContaining({
        id: 'certificate-1',
        renderedDataJson: '{"personName":"Ada"}',
        issuedById: undefined,
        config: expect.objectContaining({ id: 'config-1' }),
        certificateTemplate: expect.objectContaining({ id: 'template-1' }),
        deletedAt: undefined,
      }),
    );
  });
});

type CertificateTemplateFixture = Parameters<typeof mapCertificateTemplate>[0];
type CertificateConfigFixture = Parameters<typeof mapCertificateConfig>[0];
type CertificateFixture = Parameters<typeof mapCertificate>[0];

function certificateTemplateRecord(overrides: Partial<CertificateTemplateFixture> = {}): CertificateTemplateFixture {
  return {
    id: 'template-1',
    name: 'Template',
    description: null,
    version: 1,
    isActive: true,
    certificateFields: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedById: null,
    deletedAt: null,
    ...overrides,
  };
}

function certificateConfigRecord(overrides: Partial<CertificateConfigFixture> = {}): CertificateConfigFixture {
  return {
    id: 'config-1',
    name: 'Config',
    scope: CertificateScope.EVENT,
    majorEventId: null,
    majorEvent: null,
    eventGroupId: null,
    eventGroup: null,
    eventId: 'event-1',
    event: null,
    certificateTemplateId: 'template-1',
    certificateTemplate: certificateTemplateRecord(),
    certificateText: null,
    shouldAutofillSecondPage: true,
    secondPageText: 'Second page',
    isActive: true,
    issuedTo: 'ATTENDEE',
    certificateFields: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    createdById: null,
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    updatedById: 'user-2',
    deletedAt: null,
    ...overrides,
  };
}

function certificateRecord(overrides: Partial<CertificateFixture> = {}): CertificateFixture {
  return {
    id: 'certificate-1',
    personId: 'person-1',
    person: {
      id: 'person-1',
      name: 'Ada',
      email: null,
      secondaryEmails: [],
      phone: null,
      identityDocument: null,
      academicId: null,
      userId: null,
      mergedIntoId: null,
      externalRef: null,
      deletedAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdById: null,
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedById: null,
    },
    configId: 'config-1',
    config: certificateConfigRecord(),
    renderedData: { personName: 'Ada' },
    issuedAt: new Date('2026-01-03T00:00:00.000Z'),
    issuedById: null,
    certificateTemplateId: 'template-1',
    certificateTemplate: certificateTemplateRecord(),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}
