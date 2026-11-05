import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { parse, validate } from 'graphql';
import {
  PUBLIC_CERTIFICATE_VERIFICATION_QUERY,
  REQUEST_PUBLIC_CERTIFICATE_PREVIEW_MUTATION,
} from '@cacic-fct/event-manager-public-contracts';
import { PublicCertificateVerificationResolver } from './public-certificate-verification.resolver';
import { PublicCertificateVerificationService } from './public-certificate-verification.service';

const { jest } = import.meta;

describe('PublicCertificateVerificationResolver', () => {
  function fixture() {
    const validation = { validateCertificate: jest.fn(), findPublicRevocation: jest.fn() };
    const turnstile = { assertValidToken: jest.fn().mockResolvedValue(undefined) };
    const previews = { createToken: jest.fn().mockReturnValue('preview-token') };
    const resolver = new PublicCertificateVerificationResolver(
      new PublicCertificateVerificationService(validation as never, previews as never),
      turnstile as never,
      previews as never,
    );
    return { resolver, validation, turnstile, previews };
  }

  it('distinguishes explicit revocation and does not return participant data or a preview token', async () => {
    const { resolver, validation, previews } = fixture();
    const revokedAt = new Date(Date.now() - 60_000);
    validation.validateCertificate.mockResolvedValue(null);
    validation.findPublicRevocation.mockResolvedValue(revokedAt);

    await expect(resolver.publicCertificateVerification('certificate-1', 'token', {})).resolves.toEqual({
      certificate: null,
      revokedAt,
      previewToken: null,
    });
    expect(previews.createToken).not.toHaveBeenCalled();
  });

  it('checks Turnstile before verification and only issues a preview token for a valid certificate', async () => {
    const { resolver, validation, turnstile, previews } = fixture();
    const certificate = { id: 'certificate-1', issuedAt: new Date() };
    validation.validateCertificate.mockResolvedValue(certificate);
    turnstile.assertValidToken.mockRejectedValueOnce(new Error('Invalid token'));

    await expect(resolver.publicCertificateVerification(certificate.id, 'invalid', {})).rejects.toThrow(
      'Invalid token',
    );
    expect(validation.validateCertificate).not.toHaveBeenCalled();
    await expect(resolver.publicCertificateVerification(certificate.id, 'token', {})).resolves.toEqual({
      certificate,
      revokedAt: null,
      previewToken: 'preview-token',
    });
    expect(previews.createToken).toHaveBeenCalledWith(certificate);
    expect(validation.findPublicRevocation).not.toHaveBeenCalled();
  });

  it('publishes the operations used by the public client in the generated GraphQL schema', async () => {
    const app = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const factory = app.get(GraphQLSchemaFactory);
      const schema = await factory.create([PublicCertificateVerificationResolver]);
      expect(validate(schema, parse(PUBLIC_CERTIFICATE_VERIFICATION_QUERY))).toEqual([]);
      expect(validate(schema, parse(REQUEST_PUBLIC_CERTIFICATE_PREVIEW_MUTATION))).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
