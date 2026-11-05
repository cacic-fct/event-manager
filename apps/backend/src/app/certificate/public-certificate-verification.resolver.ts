import { PublicCertificatePreview, PublicCertificateVerification } from '@cacic-fct/shared-data-types';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { TurnstileService } from '../turnstile/turnstile.service';
import { CertificatePreviewService } from './certificate-preview.service';
import { isCertificatePreviewId } from './certificate-preview-source';
import { PublicCertificateValidationService } from './public-certificate-validation.service';

@Resolver()
export class PublicCertificateVerificationResolver {
  constructor(
    private readonly validation: PublicCertificateValidationService,
    private readonly turnstile: TurnstileService,
    private readonly previews: CertificatePreviewService,
  ) {}

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicCertificateValidation)
  @Query(() => PublicCertificateVerification, {
    description: 'Verifies a public certificate and distinguishes explicit revocations from unknown identifiers.',
  })
  async publicCertificateVerification(
    @Args('certificateId', { type: () => String }) certificateId: string,
    @Args('turnstileToken', { type: () => String, nullable: true }) turnstileToken: string | null,
    @Context() context: { req?: Request; request?: Request },
  ): Promise<PublicCertificateVerification> {
    await this.turnstile.assertValidToken(
      turnstileToken,
      context.req ?? context.request,
      TURNSTILE_ACTIONS.certificateValidation,
    );

    const id = certificateId.trim();
    if (!isCertificatePreviewId(id)) {
      return { certificate: null, revokedAt: null, previewToken: null };
    }
    return audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, async () => {
      const certificate = await this.validation.validateCertificate(id);
      if (!certificate) {
        return { certificate: null, revokedAt: await this.validation.findPublicRevocation(id), previewToken: null };
      }
      return { certificate, revokedAt: null, previewToken: this.previews.createToken(certificate) };
    });
  }

  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicCertificatePreview)
  @Mutation(() => PublicCertificatePreview, {
    nullable: true,
    description:
      'Requests the optional first-page preview after verification. Poll pending results at most once every two seconds.',
  })
  requestPublicCertificatePreview(
    @Args('certificateId', { type: () => String }) certificateId: string,
    @Args('previewToken', { type: () => String }) previewToken: string,
  ): Promise<PublicCertificatePreview | null> {
    return this.previews.request(certificateId, previewToken);
  }
}
