import { Controller, Get, Header, NotFoundException, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Request } from 'express';
import { Readable } from 'node:stream';
import { RateLimitService } from '../../rate-limit/rate-limit.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
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
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get('archive.zip')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.currentUserCertificateArchive)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download every certificate owned by the current user as a ZIP archive',
    description: 'Streams rendered certificates into the archive without buffering the complete ZIP in server memory.',
  })
  @ApiProduces('application/zip')
  @ApiOkResponse({
    description: 'A streamed ZIP archive containing the current user certificates and events manifest.',
  })
  @ApiNotFoundResponse({ description: 'Returned when the current user has no certificates.' })
  async downloadArchive(@Req() request: RequestWithUser): Promise<StreamableFile> {
    const person = await this.currentUserContext.requireCurrentPerson({ req: request });
    const issuedBefore = new Date();
    const certificates = this.archiveCertificates(person.id, issuedBefore);
    const first = await certificates.next();
    if (first.done) {
      throw new NotFoundException('No certificates were found for the current user.');
    }
    const firstCertificate = first.value;
    async function* certificateIds() {
      yield firstCertificate.id;
      for await (const certificate of certificates) {
        yield certificate.id;
      }
    }

    const archive = await this.downloadService.createCertificatesArchive(
      person.name,
      certificateIds(),
      Readable.from(this.archiveManifest(person.id, issuedBefore)),
    );

    const response = request.res;
    const cancel = () => archive.stream.destroy();
    response?.once('close', cancel);
    archive.stream.once('close', () => response?.off('close', cancel));

    return new StreamableFile(archive.stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${archive.fileName}"`,
    });
  }

  @Get('archive-status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Read the account archive cooldown without consuming a download' })
  @ApiOkResponse({
    description: 'Remaining account cooldown in seconds.',
    schema: {
      type: 'object',
      properties: { cooldownSeconds: { type: 'integer', example: 300 } },
    },
  })
  async archiveStatus(@Req() request: RequestWithUser): Promise<{ cooldownSeconds: number }> {
    this.currentUserContext.getAuthenticatedUser({ req: request });
    const status = await this.rateLimits.status({
      policy: RATE_LIMIT_POLICIES.currentUserCertificateArchive,
      request,
    });
    return { cooldownSeconds: status.disabled ? 0 : status.retryAfterSeconds };
  }

  private async *archiveCertificates(personId: string, issuedBefore: Date) {
    let lastId: string | undefined;
    while (true) {
      const certificates = await this.prisma.certificate.findMany({
        where: {
          personId,
          deletedAt: null,
          issuedAt: { lte: issuedBefore },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        select: {
          id: true,
          issuedAt: true,
          configId: true,
          renderedData: true,
          config: {
            select: {
              scope: true,
              majorEventId: true,
              eventGroupId: true,
              eventId: true,
              folderId: true,
              folder: { select: { name: true, emoji: true } },
            },
          },
        },
        orderBy: { id: 'asc' },
        take: 50,
      });
      for (const certificate of certificates) {
        yield certificate;
      }
      if (certificates.length < 50) {
        return;
      }
      lastId = certificates[certificates.length - 1].id;
    }
  }

  private async *archiveManifest(personId: string, issuedBefore: Date) {
    yield `{"schemaVersion":1,"generatedAt":${JSON.stringify(issuedBefore.toISOString())},"certificates":[`;
    let separator = '';
    for await (const certificate of this.archiveCertificates(personId, issuedBefore)) {
      yield separator + JSON.stringify({
        certificateId: certificate.id,
        issuedAt: certificate.issuedAt.toISOString(),
        configId: certificate.configId,
        scope: certificate.config.scope,
        targetId:
          certificate.config.scope === CertificateScope.MAJOR_EVENT
          ? certificate.config.majorEventId
          : certificate.config.scope === CertificateScope.EVENT_GROUP
            ? certificate.config.eventGroupId
            : certificate.config.scope === CertificateScope.EVENT
              ? certificate.config.eventId
              : certificate.config.folderId,
        targetName: certificate.config.folder?.name ?? null,
        targetEmoji: certificate.config.folder?.emoji ?? null,
        eventIds: this.readRenderedEventIds(certificate.renderedData),
      });
      separator = ',';
    }
    yield ']}\n';
  }

  private readRenderedEventIds(renderedData: unknown): string[] {
    if (!renderedData || typeof renderedData !== 'object' || Array.isArray(renderedData)) {
      return [];
    }

    const events = (renderedData as { events?: unknown }).events;
    if (!Array.isArray(events)) {
      return [];
    }

    return events
      .map((event) => {
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
          return null;
        }

        const id = (event as { id?: unknown }).id;
        return typeof id === 'string' && id.trim() ? id : null;
      })
      .filter((id): id is string => id !== null);
  }
}
