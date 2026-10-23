import { IncludePastParticipation } from '../../audiences/past-participation.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type Request } from 'express';
import { type AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CertificateDownloadService } from '../../certificate/certificate-download.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { CurrentUserContextService } from '../context.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@ApiTags('Current user certificates')
@ApiBearerAuth()
@Controller('current-user/certificates')
export class CurrentUserCertificatesDownloadController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly downloadService: CertificateDownloadService,
  ) {}

  @Post('archive.zip')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.currentUserCertificateArchive)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download selected certificates owned by the current user',
    description:
      'Checks ownership of the entire selection before streaming PDFs and a versioned validation manifest. ' +
      'Reuses a rendering browser and propagates download backpressure.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['certificateIds'],
      properties: {
        certificateIds: {
          type: 'array',
          minItems: 1,
          maxItems: 10000,
          items: { type: 'string', maxLength: 128 },
          example: ['certificate-1'],
        },
      },
    },
  })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'A streamed ZIP with selected PDFs and certificates.json (schema version 2).' })
  @ApiBadRequestResponse({ description: 'The certificate selection is empty, malformed, or too large.' })
  @ApiNotFoundResponse({ description: 'At least one selected certificate is unavailable to the current user.' })
  @IncludePastParticipation()
  async downloadSelectedArchive(@Req() request: RequestWithUser, @Body() input: unknown): Promise<StreamableFile> {
    return this.streamArchive(request, this.readSelectedIds(input));
  }

  // Preserve existing direct download links; the attendance UI always sends an explicit selection.
  @Get('archive.zip')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.currentUserCertificateArchive)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Download all owned certificates', deprecated: true })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'A streamed ZIP containing owned certificates and the validation manifest.' })
  @ApiNotFoundResponse({ description: 'The current user has no certificates.' })
  @IncludePastParticipation()
  async downloadArchive(@Req() request: RequestWithUser): Promise<StreamableFile> {
    return this.streamArchive(request);
  }

  private async streamArchive(request: RequestWithUser, selectedIds?: string[]): Promise<StreamableFile> {
    const person = await this.currentUserContext.requireCurrentPerson({ req: request });
    const issuedBefore = new Date();
    if (selectedIds) {
      const availableCount = await this.prisma.certificate.count({
        where: { personId: person.id, deletedAt: null, issuedAt: { lte: issuedBefore }, id: { in: selectedIds } },
      });
      if (availableCount !== selectedIds.length) {
        throw new NotFoundException(
          'One or more selected certificates are unavailable. Refresh the selection and try again.',
        );
      }
    }
    const certificates = this.archiveCertificates(person.id, issuedBefore, selectedIds);
    const first = await certificates.next();
    if (first.done) {
      throw new NotFoundException('No certificates were found for the current user.');
    }
    const firstCertificate = first.value;
    async function* archiveEntries() {
      yield firstCertificate;
      yield* certificates;
    }
    const archive = await this.downloadService.createCertificatesArchive(person.name, archiveEntries(), issuedBefore);
    const response = request.res;
    const cancel = () => archive.stream.destroy();
    response?.once('close', cancel);
    archive.stream.once('close', () => response?.off('close', cancel));

    return new StreamableFile(archive.stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${archive.fileName}"`,
    });
  }

  private readSelectedIds(input: unknown): string[] {
    const ids = input && typeof input === 'object' && 'certificateIds' in input ? input.certificateIds : null;
    if (
      !Array.isArray(ids) ||
      ids.length === 0 ||
      ids.length > 10000 ||
      ids.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.length > 128)
    ) {
      throw new BadRequestException('Select between 1 and 10000 valid certificate IDs.');
    }
    return [...new Set((ids as string[]).map((id) => id.trim()))];
  }

  private async *archiveCertificates(personId: string, issuedBefore: Date, selectedIds?: string[]) {
    let lastId: string | undefined;
    while (true) {
      const certificates = await this.prisma.certificate.findMany({
        where: {
          personId,
          deletedAt: null,
          issuedAt: { lte: issuedBefore },
          id: { ...(selectedIds ? { in: selectedIds } : {}), ...(lastId ? { gt: lastId } : {}) },
        },
        select: { id: true, issuedAt: true },
        orderBy: { id: 'asc' },
        take: 50,
      });
      yield* certificates;
      if (certificates.length < 50) {
        return;
      }
      lastId = certificates[certificates.length - 1].id;
    }
  }
}
