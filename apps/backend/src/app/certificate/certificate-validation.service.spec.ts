import { BadRequestException } from '@nestjs/common';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { CertificateValidationService } from './certificate-validation.service';

describe('CertificateValidationService', () => {
  const service = new CertificateValidationService();

  it('normalizes required ids and names', () => {
    expect(service.normalizeRequiredId('eventId', ' event-1 ')).toBe('event-1');
    expect(service.normalizeRequiredName(' Certificado ')).toBe('Certificado');
  });

  it('rejects empty required ids and names', () => {
    expect(() => service.normalizeRequiredId('eventId', '   ')).toThrow(BadRequestException);
    expect(() => service.normalizeRequiredName('   ')).toThrow(BadRequestException);
  });

  it('normalizes optional ids and text values', () => {
    expect(service.normalizeOptionalId(undefined)).toBeUndefined();
    expect(service.normalizeOptionalId(null)).toBeUndefined();
    expect(service.normalizeOptionalId(' group-1 ')).toBe('group-1');
    expect(service.normalizeOptionalId('   ')).toBeUndefined();

    expect(service.normalizeOptionalText(undefined)).toBeUndefined();
    expect(service.normalizeOptionalText(null)).toBeNull();
    expect(service.normalizeOptionalText(' Texto do certificado ')).toBe('Texto do certificado');
    expect(service.normalizeOptionalText('   ')).toBeNull();
  });

  it('normalizes certificate field json', () => {
    expect(service.normalizeCertificateFieldsJson(undefined)).toBeUndefined();
    expect(service.normalizeCertificateFieldsJson(null)).toBeNull();
    expect(service.normalizeCertificateFieldsJson('   ')).toBeNull();
    expect(service.normalizeCertificateFieldsJson('{"topText":"Participou"}')).toEqual({ topText: 'Participou' });
    expect(() => service.normalizeCertificateFieldsJson('{bad json')).toThrow(BadRequestException);
  });

  it('accepts exactly one target for each supported scope', () => {
    expect(() =>
      service.assertScopeTargetConsistency(CertificateScope.MAJOR_EVENT, { majorEventId: 'major-event-1' }),
    ).not.toThrow();
    expect(() =>
      service.assertScopeTargetConsistency(CertificateScope.EVENT_GROUP, { eventGroupId: 'group-1' }),
    ).not.toThrow();
    expect(() => service.assertScopeTargetConsistency(CertificateScope.EVENT, { eventId: 'event-1' })).not.toThrow();
  });

  it('rejects unsupported or inconsistent certificate scope targets', () => {
    expect(() => service.assertSupportedScope(CertificateScope.OTHER)).toThrow(BadRequestException);
    expect(() =>
      service.assertScopeTargetConsistency(CertificateScope.MAJOR_EVENT, {
        majorEventId: 'major-event-1',
        eventId: 'event-1',
      }),
    ).toThrow(BadRequestException);
    expect(() => service.assertScopeTargetConsistency(CertificateScope.EVENT_GROUP, {})).toThrow(BadRequestException);
    expect(() =>
      service.assertScopeTargetConsistency(CertificateScope.EVENT, {
        majorEventId: 'major-event-1',
        eventId: 'event-1',
      }),
    ).toThrow(BadRequestException);
  });
});
