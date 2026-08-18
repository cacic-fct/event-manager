import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { SportsIdentityType } from '@prisma/client';
import { SportsIdentityProtectionService } from './sports-identity-protection.service';

describe('SportsIdentityProtectionService', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('normalizes deterministic lookup hashes but randomizes authenticated ciphertext', () => {
    const service = createService('test-secret');

    const first = service.protect(SportsIdentityType.EMAIL, '  Maria@Example.COM ');
    const second = service.protect(SportsIdentityType.EMAIL, 'maria@example.com');

    expect(first.lookupHash).toBe(second.lookupHash);
    expect(first.encryptedValue).not.toBe(second.encryptedValue);
    expect(first.displayHint).toBe('ma***@example.com');
    expect(first.encryptedValue).not.toContain('maria');
    expect(service.reveal(SportsIdentityType.EMAIL, first.encryptedValue)).toBe('maria@example.com');
    expect(service.matches(SportsIdentityType.EMAIL, 'MARIA@example.com', first.lookupHash)).toBe(true);
  });

  it('normalizes phone and identity-document variants before protecting them', () => {
    const service = createService('test-secret');
    const phone = service.protect(SportsIdentityType.PHONE, '+55 (11) 99999-1234');
    const document = service.protect(SportsIdentityType.IDENTITY_DOCUMENT, 'abc-12.34');

    expect(service.reveal(SportsIdentityType.PHONE, phone.encryptedValue)).toBe('5511999991234');
    expect(phone.displayHint).toBe('••••1234');
    expect(service.reveal(SportsIdentityType.IDENTITY_DOCUMENT, document.encryptedValue)).toBe('ABC1234');
    expect(document.displayHint).toBe('AB••••34');
  });

  it('rejects malformed, tampered, and semantically invalid values without leaking details', () => {
    const service = createService('test-secret');
    const protectedIdentity = service.protect(SportsIdentityType.EMAIL, 'maria@example.com');
    const tamperedSegments = protectedIdentity.encryptedValue.split('.');
    const tamperedAuthenticationTag = Buffer.from(tamperedSegments[2], 'base64url');
    tamperedAuthenticationTag[0] ^= 1;
    tamperedSegments[2] = tamperedAuthenticationTag.toString('base64url');
    const tampered = tamperedSegments.join('.');

    expect(() => service.reveal(SportsIdentityType.EMAIL, tampered)).toThrow(BadRequestException);
    expect(() => service.reveal(SportsIdentityType.EMAIL, 'not-ciphertext')).toThrow(BadRequestException);
    expect(() => service.protect(SportsIdentityType.EMAIL, 'invalid')).toThrow(BadRequestException);
    expect(() => service.protect(SportsIdentityType.PHONE, '123')).toThrow(BadRequestException);
  });

  it('uses constant-time-safe length handling for untrusted lookup hashes', () => {
    const service = createService('test-secret');

    expect(service.matches(SportsIdentityType.EMAIL, 'maria@example.com', 'short')).toBe(false);
  });

  it('requires an explicit secret in production', () => {
    process.env.NODE_ENV = 'production';

    expect(() => createService(undefined)).toThrow(InternalServerErrorException);
  });
});

function createService(secret: string | undefined) {
  return new SportsIdentityProtectionService({
    get: jest.fn().mockReturnValue(secret),
  } as never);
}
