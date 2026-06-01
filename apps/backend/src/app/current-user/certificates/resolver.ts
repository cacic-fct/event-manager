import { Certificate, CertificateDownload, CertificateScope } from '@cacic-fct/shared-data-types';
import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import { CERTIFICATE_SELECT, buildConfigTargetWhere, mapCertificate } from '../../certificate/certificate.constants';
import { CertificateDownloadService } from '../../certificate/certificate-download.service';
import { CertificateValidationService } from '../../certificate/certificate-validation.service';
import { resolvePagination } from '../../common/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';

@Resolver()
export class CurrentUserCertificatesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly validation: CertificateValidationService,
    private readonly downloadService: CertificateDownloadService,
  ) {}

  @Query(() => [Certificate], { name: 'currentUserCertificates' })
  async currentUserCertificates(
    @Args('scope', { type: () => CertificateScope }) scope: CertificateScope,
    @Args('targetId', { type: () => String }) targetId: string,
    @Context() context: GraphqlContext,
    @Args('configId', { type: () => String, nullable: true }) configId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<Certificate[]> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      return [];
    }

    this.validation.assertSupportedScope(scope);
    const normalizedTargetId = this.validation.normalizeRequiredId('targetId', targetId);
    const normalizedConfigId = this.validation.normalizeOptionalId(configId);
    const pagination = resolvePagination(skip, take);

    const certificates = await this.prisma.certificate.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
        config: {
          deletedAt: null,
          ...buildConfigTargetWhere(scope, normalizedTargetId),
          ...(normalizedConfigId ? { id: normalizedConfigId } : {}),
        },
      },
      select: CERTIFICATE_SELECT,
      orderBy: {
        issuedAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });

    return certificates.map(mapCertificate);
  }

  @Query(() => CertificateDownload, {
    name: 'downloadCurrentUserCertificate',
  })
  async downloadCurrentUserCertificate(
    @Args('certificateId', { type: () => String }) certificateId: string,
    @Context() context: GraphqlContext,
  ): Promise<CertificateDownload> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { person } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser);
    if (!person) {
      throw new NotFoundException(`Certificate ${certificateId.trim()} was not found.`);
    }

    const normalizedCertificateId = this.validation.normalizeRequiredId('certificateId', certificateId);
    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: normalizedCertificateId,
        personId: person.id,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException(`Certificate ${normalizedCertificateId} was not found.`);
    }

    return this.downloadService.downloadCertificate(normalizedCertificateId);
  }

  @Query(() => CertificateDownload, {
    name: 'downloadCurrentUserCertificatesArchive',
    description:
      'Downloads every certificate owned by the authenticated person as a ZIP with a minimal events.json manifest for future validation imports.',
  })
  async downloadCurrentUserCertificatesArchive(@Context() context: GraphqlContext): Promise<CertificateDownload> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const certificates = await this.prisma.certificate.findMany({
      where: {
        personId: person.id,
        deletedAt: null,
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
          },
        },
      },
      orderBy: {
        issuedAt: 'asc',
      },
    });

    if (certificates.length === 0) {
      throw new NotFoundException('No certificates were found for the current user.');
    }

    return this.downloadService.downloadCertificatesArchive(
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
                : certificate.config.eventId,
          eventIds: this.readRenderedEventIds(certificate.renderedData),
        })),
      },
    );
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
