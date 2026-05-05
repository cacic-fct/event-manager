import {
  Certificate,
  CertificateDownload,
  CertificateConfig,
  CertificateConfigCreateInput,
  CertificateConfigUpdateInput,
  CertificateScope,
  CertificateTemplate,
  Event,
  EventGroup,
  MajorEvent,
  PublicCertificateValidation,
} from '@cacic-eventos/shared-data-types';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard';
import { CertificateConfigsService } from './certificate-configs.service';
import { CertificateDownloadService } from './certificate-download.service';
import { CertificateIssuingService } from './certificate-issuing.service';
import { CertificateTargetsService } from './certificate-targets.service';
import { PublicCertificateValidationService } from './public-certificate-validation.service';

type GraphqlRequest = Request & {
  user?: AuthenticatedUser;
};

type GraphqlContext = {
  req?: GraphqlRequest;
  request?: GraphqlRequest;
};

@Resolver()
export class CertificatesResolver {
  constructor(
    private readonly targetsService: CertificateTargetsService,
    private readonly configsService: CertificateConfigsService,
    private readonly issuingService: CertificateIssuingService,
    private readonly downloadService: CertificateDownloadService,
    private readonly publicValidationService: PublicCertificateValidationService,
  ) {}

  @Query(() => [Event], { name: 'certificateIssuableEvents' })
  @RequireScopes('certificate#read')
  certificateIssuableEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.targetsService.listIssuableEvents(query, skip, take);
  }

  @Query(() => [EventGroup], { name: 'certificateIssuableEventGroups' })
  @RequireScopes('certificate#read')
  certificateIssuableEventGroups(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.targetsService.listIssuableEventGroups(query, skip, take);
  }

  @Query(() => [MajorEvent], { name: 'certificateIssuableMajorEvents' })
  @RequireScopes('certificate#read')
  certificateIssuableMajorEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.targetsService.listIssuableMajorEvents(query, skip, take);
  }

  @Query(() => [CertificateTemplate], { name: 'certificateTemplates' })
  @RequireScopes('certificate#read')
  certificateTemplates(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('includeInactive', { type: () => Boolean, nullable: true })
    includeInactive?: boolean,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.configsService.listTemplates(
      query,
      includeInactive,
      skip,
      take,
    );
  }

  @Query(() => [CertificateConfig], { name: 'certificateConfigs' })
  @RequireScopes('certificate#read')
  certificateConfigs(
    @Args('scope', { type: () => CertificateScope }) scope: CertificateScope,
    @Args('targetId', { type: () => String }) targetId: string,
    @Args('includeInactive', { type: () => Boolean, nullable: true })
    includeInactive?: boolean,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.configsService.listConfigsByTarget(
      scope,
      targetId,
      includeInactive ?? true,
      skip,
      take,
    );
  }

  @Query(() => [Certificate], { name: 'certificates' })
  @RequireScopes('certificate#read')
  certificates(
    @Args('scope', { type: () => CertificateScope }) scope: CertificateScope,
    @Args('targetId', { type: () => String }) targetId: string,
    @Args('configId', { type: () => String, nullable: true }) configId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.issuingService.listCertificatesByTarget(
      scope,
      targetId,
      configId,
      skip,
      take,
    );
  }

  @Query(() => CertificateDownload, { name: 'downloadCertificate' })
  @RequireScopes('certificate#read')
  downloadCertificate(
    @Args('certificateId', { type: () => String }) certificateId: string,
  ) {
    return this.downloadService.downloadCertificate(certificateId);
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({
    publicCertificateValidation: {
      limit: 20,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  @Query(() => PublicCertificateValidation, {
    name: 'publicCertificateValidation',
    nullable: true,
  })
  publicCertificateValidation(
    @Args('certificateId', { type: () => String }) certificateId: string,
  ) {
    return this.publicValidationService.validateCertificate(certificateId);
  }

  @Public()
  @UseGuards(GqlThrottlerGuard)
  @Throttle({
    publicCertificateValidation: {
      limit: 10,
      ttl: 60_000,
      blockDuration: 60_000,
    },
  })
  @Query(() => CertificateDownload, { name: 'downloadPublicCertificate' })
  downloadPublicCertificate(
    @Args('certificateId', { type: () => String }) certificateId: string,
  ) {
    return this.downloadService.downloadCertificate(certificateId);
  }

  @Mutation(() => CertificateConfig, { name: 'createCertificateConfig' })
  @RequireScopes('certificate#edit')
  createCertificateConfig(
    @Args('input', { type: () => CertificateConfigCreateInput })
    input: CertificateConfigCreateInput,
  ) {
    return this.configsService.createConfig(input);
  }

  @Mutation(() => CertificateConfig, { name: 'updateCertificateConfig' })
  @RequireScopes('certificate#edit')
  updateCertificateConfig(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => CertificateConfigUpdateInput })
    input: CertificateConfigUpdateInput,
  ) {
    return this.configsService.updateConfig(id, input);
  }

  @Mutation(() => Certificate, { name: 'issueCertificateForPerson' })
  @RequireScopes('certificate#edit')
  issueCertificateForPerson(
    @Args('configId', { type: () => String }) configId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    return this.issuingService.issueForPerson(
      configId,
      personId,
      this.getIssuedById(context),
    );
  }

  @Mutation(() => [Certificate], { name: 'issueMissedCertificates' })
  @RequireScopes('certificate#edit')
  issueMissedCertificates(
    @Args('configId', { type: () => String }) configId: string,
    @Context() context: GraphqlContext,
  ) {
    return this.issuingService.issueMissedCertificates(
      configId,
      this.getIssuedById(context),
    );
  }

  private getIssuedById(context: GraphqlContext): string | undefined {
    const user = context.req?.user ?? context.request?.user;
    const subject = user?.sub?.trim();
    return subject || undefined;
  }
}
