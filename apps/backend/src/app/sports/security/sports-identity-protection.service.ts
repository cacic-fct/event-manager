import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SportsIdentityType } from '@prisma/client';
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const ENCRYPTION_VERSION = 'v1';
const LOCAL_DEVELOPMENT_SECRET = 'local-development-sports-identity-secret';

export interface ProtectedSportsIdentity {
  encryptedValue: string;
  lookupHash: string;
  displayHint: string;
}

@Injectable()
export class SportsIdentityProtectionService {
  private readonly encryptionKey: Buffer;
  private readonly lookupKey: Buffer;

  constructor(config: ConfigService) {
    const configuredSecret = config.get<string>('SPORTS_IDENTITY_SECRET')?.trim();
    const environment = config.get<string>('NODE_ENV')?.trim();
    const isLocalEnvironment = environment === 'development' || environment === 'test';
    if (!configuredSecret && !isLocalEnvironment) {
      throw new InternalServerErrorException('SPORTS_IDENTITY_SECRET is required outside development and test.');
    }

    const secret = configuredSecret || LOCAL_DEVELOPMENT_SECRET;
    this.encryptionKey = Buffer.from(
      hkdfSync('sha256', secret, '', 'sports-identity-encryption', 32),
    );
    this.lookupKey = Buffer.from(
      hkdfSync('sha256', secret, '', 'sports-identity-lookup', 32),
    );
  }

  protect(type: SportsIdentityType, rawValue: string): ProtectedSportsIdentity {
    const normalizedValue = this.normalize(type, rawValue);
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, initializationVector);
    const encrypted = Buffer.concat([cipher.update(normalizedValue, 'utf8'), cipher.final()]);
    const authenticationTag = cipher.getAuthTag();

    return {
      encryptedValue: [
        ENCRYPTION_VERSION,
        initializationVector.toString('base64url'),
        authenticationTag.toString('base64url'),
        encrypted.toString('base64url'),
      ].join('.'),
      lookupHash: this.hash(type, normalizedValue),
      displayHint: this.mask(type, normalizedValue),
    };
  }

  reveal(type: SportsIdentityType, encryptedValue: string): string {
    const [version, initializationVector, authenticationTag, encrypted] = encryptedValue.split('.');
    if (version !== ENCRYPTION_VERSION || !initializationVector || !authenticationTag || !encrypted) {
      throw new BadRequestException('Identidade esportiva criptografada inválida.');
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey,
        Buffer.from(initializationVector, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(authenticationTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new BadRequestException('Identidade esportiva criptografada inválida.');
    }
  }

  matches(type: SportsIdentityType, rawValue: string, expectedHash: string): boolean {
    const actualHash = this.hash(type, this.normalize(type, rawValue));
    const actual = Buffer.from(actualHash);
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  normalize(type: SportsIdentityType, rawValue: string): string {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      throw new BadRequestException('O identificador da pessoa é obrigatório.');
    }

    if (type === SportsIdentityType.EMAIL) {
      const email = trimmed.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        throw new BadRequestException('Informe um e-mail válido.');
      }
      return email;
    }

    if (type === SportsIdentityType.PHONE) {
      const phone = trimmed.replace(/\D/g, '');
      if (phone.length < 8 || phone.length > 15) {
        throw new BadRequestException('Informe um telefone válido.');
      }
      return phone;
    }

    const identityDocument = trimmed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (identityDocument.length < 4 || identityDocument.length > 64) {
      throw new BadRequestException('Informe um documento de identidade válido.');
    }
    return identityDocument;
  }

  private hash(type: SportsIdentityType, normalizedValue: string): string {
    return createHmac('sha256', this.lookupKey)
      .update(`sports-identity:${type}:${normalizedValue}`)
      .digest('base64url');
  }

  private mask(type: SportsIdentityType, normalizedValue: string): string {
    if (type === SportsIdentityType.EMAIL) {
      const [localPart, domain] = normalizedValue.split('@');
      return `${localPart.slice(0, 2)}***@${domain}`;
    }

    if (type === SportsIdentityType.PHONE) {
      return `••••${normalizedValue.slice(-4)}`;
    }

    return `${normalizedValue.slice(0, 2)}••••${normalizedValue.slice(-2)}`;
  }
}
