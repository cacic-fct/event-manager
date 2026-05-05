import {
  Certificate,
  CertificateDownload,
  CertificateScope,
} from '@cacic-eventos/shared-data-types';
import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { NotFoundException } from '@nestjs/common';
import {
  CERTIFICATE_SELECT,
  buildConfigTargetWhere,
  mapCertificate,
} from '../../certificate/certificate.constants';
import { CertificateDownloadService } from '../../certificate/certificate-download.service';
import { CertificateValidationService } from '../../certificate/certificate-validation.service';
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
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
      );
    if (!person) {
      return [];
    }

    this.validation.assertSupportedScope(scope);
    const normalizedTargetId = this.validation.normalizeRequiredId(
      'targetId',
      targetId,
    );
    const normalizedConfigId = this.validation.normalizeOptionalId(configId);

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
      skip,
      take,
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
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
      );
    if (!person) {
      throw new NotFoundException(
        `Certificate ${certificateId.trim()} was not found.`,
      );
    }

    const normalizedCertificateId = this.validation.normalizeRequiredId(
      'certificateId',
      certificateId,
    );
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
      throw new NotFoundException(
        `Certificate ${normalizedCertificateId} was not found.`,
      );
    }

    return this.downloadService.downloadCertificate(normalizedCertificateId);
  }
}
