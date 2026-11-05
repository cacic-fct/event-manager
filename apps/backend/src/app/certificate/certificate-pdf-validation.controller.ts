import {
  BadRequestException,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Req,
  ServiceUnavailableException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PUBLIC_CERTIFICATE_PDF_MAX_BYTES } from '@cacic-fct/event-manager-public-contracts';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import express, { type Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { TurnstileService } from '../turnstile/turnstile.service';
import { extractCertificatePdfId } from './extract-certificate-pdf-id';
import { PublicCertificateVerificationService } from './public-certificate-verification.service';

const MAX_ACTIVE_UPLOADS = 2;
const UPLOAD_DEADLINE_MS = 15_000;
const readPdfBody = express.raw({ type: 'application/pdf', limit: PUBLIC_CERTIFICATE_PDF_MAX_BYTES, inflate: false });

@ApiTags('Certificates')
@Controller('certificates/validate')
export class CertificatePdfValidationController {
  private activeUploads = 0;

  constructor(
    private readonly turnstile: TurnstileService,
    private readonly verification: PublicCertificateVerificationService,
  ) {}

  @Post('pdf')
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicCertificateValidation)
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a certificate by extracting its ID from the visible text of one PDF.',
    description: 'The request body is the PDF itself. The file is processed in memory after Turnstile verification.',
  })
  @ApiConsumes('application/pdf')
  @ApiHeader({ name: 'X-Turnstile-Token', required: true, description: 'Token for the certificate validation action.' })
  @ApiBody({ schema: { type: 'string', format: 'binary' }, description: 'One PDF, up to 5 MiB.' })
  @ApiOkResponse({
    description: 'The extracted ID and its public verification result.',
    schema: {
      example: {
        certificateId: '019cb4fe-76e3-7000-8000-8a75e6b8f1cb',
        certificate: null,
        revokedAt: null,
        previewToken: null,
      },
    },
  })
  @ApiResponse({ status: 413, description: 'The upload exceeds 5 MiB.' })
  @ApiResponse({ status: 415, description: 'The body is not application/pdf or uses HTTP content encoding.' })
  @ApiResponse({ status: 422, description: 'The PDF body has no unique certificate ID.' })
  @ApiResponse({ status: 429, description: 'The public validation rate limit was exceeded.' })
  @ApiResponse({ status: 503, description: 'All PDF upload slots are busy or verification is unavailable.' })
  async validatePdf(@Req() request: Request) {
    if (
      !request.is('application/pdf') ||
      (request.get('Content-Encoding') ?? 'identity').toLowerCase() !== 'identity'
    ) {
      throw new UnsupportedMediaTypeException('Send one application/pdf request body.');
    }
    if (Number(request.get('Content-Length')) > PUBLIC_CERTIFICATE_PDF_MAX_BYTES) {
      throw new PayloadTooLargeException();
    }
    if (this.activeUploads >= MAX_ACTIVE_UPLOADS) {
      throw new ServiceUnavailableException('Certificate PDF processing is busy.');
    }
    if (process.env.NODE_ENV === 'production' && process.platform !== 'linux') {
      throw new ServiceUnavailableException('Bounded certificate PDF processing is unavailable.');
    }

    // Admit before Turnstile or body buffering. Slow and aborted uploads must release their slot.
    this.activeUploads++;
    const deadline = setTimeout(() => {
      if (!request.complete) {
        request.destroy();
      }
    }, UPLOAD_DEADLINE_MS);
    try {
      await this.turnstile.assertValidToken(
        request.get('X-Turnstile-Token'),
        request,
        TURNSTILE_ACTIONS.certificateValidation,
      );
      if (request.destroyed || request.res?.destroyed) {
        throw new BadRequestException('Certificate PDF upload was interrupted.');
      }
      const pdf = await this.readPdf(request);
      clearTimeout(deadline);
      if (request.res?.destroyed) {
        throw new BadRequestException('Certificate PDF upload was interrupted.');
      }
      const certificateId = await extractCertificatePdfId(pdf).catch(() => {
        throw new BadRequestException('Could not read the certificate PDF.');
      });
      if (!certificateId) {
        throw new UnprocessableEntityException('No unique certificate ID in the PDF body.');
      }
      return { certificateId, ...(await this.verification.verify(certificateId)) };
    } finally {
      clearTimeout(deadline);
      this.activeUploads--;
    }
  }

  private async readPdf(request: Request): Promise<Buffer> {
    await new Promise<void>((resolve, reject) => {
      readPdfBody(request, request.res!, (error?: unknown) => {
        if (!error) {
          resolve();
        } else if (typeof error === 'object' && 'status' in error && error.status === 413) {
          reject(new PayloadTooLargeException());
        } else {
          reject(new BadRequestException('Could not receive the certificate PDF.'));
        }
      });
    });
    const pdf: unknown = request.body;
    if (!Buffer.isBuffer(pdf) || !/^%PDF-\d\.\d/.test(pdf.toString('ascii', 0, 8))) {
      throw new BadRequestException('Invalid certificate PDF.');
    }
    return pdf;
  }
}
