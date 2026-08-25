import { Controller, Get, Header, NotFoundException, Req, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CertificateScope } from '@cacic-fct/shared-data-types';
import { Request } from 'express';
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
    const certificates = await this.prisma.certificate.findMany({
      where: { personId: person.id, deletedAt: null },
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
      orderBy: { issuedAt: 'asc' },
    });

    if (certificates.length === 0) {
      throw new NotFoundException('No certificates were found for the current user.');
    }

    const archive = await this.downloadService.createCertificatesArchive(
      person.name,
      certificates.map((certificate) => certificate.id),
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        certificates: certificates.map((certificate) => ({
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
        })),
      },
    );

    return new StreamableFile(archive.stream, {
      type: 'application/zip',
      disposition: `attachment; filename="${archive.fileName}"`,
    });
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
