import { BadRequestException } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { IncludePastParticipation } from '../../audiences/past-participation.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../rate-limit/rate-limit.service';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { CurrentUserContextService } from '../context.service';
import type { GraphqlContext } from '../selects';
import { CERTIFICATE_CATALOG_SELECT, toCertificateCatalogItem } from './certificate-catalog';
import { CurrentUserCertificateArchiveStatus, CurrentUserCertificateCatalog } from './certificate-selection.models';

const CATALOG_PAGE_SIZE = 100;

@Resolver()
export class CurrentUserCertificateSelectionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly rateLimits: RateLimitService,
  ) {}

  @Query(() => CurrentUserCertificateCatalog, {
    description:
      'Page through owned issued certificates, including certificates under child events and historical configurations.',
  })
  @IncludePastParticipation()
  async currentUserCertificateCatalog(
    @Context() context: GraphqlContext,
    @Args('cursor', { type: () => String, nullable: true }) cursor?: string | null,
  ): Promise<CurrentUserCertificateCatalog> {
    if (cursor != null && (typeof cursor !== 'string' || !cursor.trim() || cursor.length > 128)) {
      throw new BadRequestException('Invalid certificate catalog cursor.');
    }
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const certificates = await this.prisma.certificate.findMany({
      where: { personId: person.id, deletedAt: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: CERTIFICATE_CATALOG_SELECT,
      orderBy: { id: 'asc' },
      take: CATALOG_PAGE_SIZE + 1,
    });
    const page = certificates.slice(0, CATALOG_PAGE_SIZE);
    return {
      items: page.map(toCertificateCatalogItem),
      nextCursor: certificates.length > CATALOG_PAGE_SIZE ? page[page.length - 1].id : null,
    };
  }

  @Query(() => CurrentUserCertificateArchiveStatus, {
    description: 'Read the account archive cooldown without consuming a download.',
  })
  async currentUserCertificateArchiveStatus(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserCertificateArchiveStatus> {
    this.currentUserContext.getAuthenticatedUser(context);
    const status = await this.rateLimits.status({
      policy: RATE_LIMIT_POLICIES.currentUserCertificateArchive,
      request: context.req,
    });
    return { cooldownSeconds: status.disabled ? 0 : status.retryAfterSeconds };
  }
}
