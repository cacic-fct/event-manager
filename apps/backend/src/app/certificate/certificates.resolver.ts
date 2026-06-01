import {
  Certificate,
  CertificateDownload,
  CertificateConfig,
  CertificateConfigCreateInput,
  CertificateConfigUpdateInput,
  CertificateReissueResult,
  CertificateScope,
  CertificateTemplate,
  DeletionResult,
  Event,
  EventGroup,
  MajorEvent,
  PublicCertificateValidation,
} from '@cacic-fct/shared-data-types';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
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
    private readonly frozenResources: FrozenResourceService,
  ) {}

  @Query(() => [Event], { name: 'certificateIssuableEvents' })
  @RequireScopes('certificate#read')
  certificateIssuableEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    return this.targetsService.listIssuableEvents(query, pagination.skip, pagination.take);
  }

  @Query(() => [EventGroup], { name: 'certificateIssuableEventGroups' })
  @RequireScopes('certificate#read')
  certificateIssuableEventGroups(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    return this.targetsService.listIssuableEventGroups(query, pagination.skip, pagination.take);
  }

  @Query(() => [MajorEvent], { name: 'certificateIssuableMajorEvents' })
  @RequireScopes('certificate#read')
  certificateIssuableMajorEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    return this.targetsService.listIssuableMajorEvents(query, pagination.skip, pagination.take);
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
    const pagination = resolvePagination(skip, take);
    return this.configsService.listTemplates(query, includeInactive, pagination.skip, pagination.take);
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
    const pagination = resolvePagination(skip, take);
    return this.configsService.listConfigsByTarget(scope, targetId, includeInactive ?? true, pagination.skip, pagination.take);
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
    const pagination = resolvePagination(skip, take);
    return this.issuingService.listCertificatesByTarget(scope, targetId, configId, pagination.skip, pagination.take);
  }

  @Query(() => CertificateDownload, { name: 'downloadCertificate' })
  @RequireScopes('certificate#read')
  downloadCertificate(@Args('certificateId', { type: () => String }) certificateId: string) {
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
    description:
      'Public certificate authenticity lookup. Returns participant-safe certificate metadata, masked identity information, grouped credited events, and total workload; returns null when the certificate cannot be publicly validated. Rate limited to 20 lookups per minute.',
  })
  publicCertificateValidation(
    @Args('certificateId', {
      type: () => String,
      description: 'Certificate identifier printed in certificate verification links and QR codes.',
    })
    certificateId: string,
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
  @Query(() => CertificateDownload, {
    name: 'downloadPublicCertificate',
    description:
      'Downloads a publicly accessible rendered certificate as base64 content. Intended for certificate links and QR-code flows; rate limited to 10 downloads per minute.',
  })
  downloadPublicCertificate(
    @Args('certificateId', {
      type: () => String,
      description: 'Certificate identifier printed in certificate verification links and QR codes.',
    })
    certificateId: string,
  ) {
    return this.downloadService.downloadCertificate(certificateId);
  }

  @Mutation(() => CertificateConfig, { name: 'createCertificateConfig' })
  @RequireScopes('certificate#edit')
  async createCertificateConfig(
    @Args('input', { type: () => CertificateConfigCreateInput })
    input: CertificateConfigCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateTargetMutable(
      input.scope,
      this.getCertificateTargetId(input.scope, input),
      this.getUser(context),
      'edit',
    );
    return this.configsService.createConfig(input);
  }

  @Mutation(() => CertificateConfig, { name: 'updateCertificateConfig' })
  @RequireScopes('certificate#edit')
  async updateCertificateConfig(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => CertificateConfigUpdateInput })
    input: CertificateConfigUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(id, this.getUser(context), 'edit');
    return this.configsService.updateConfig(id, input);
  }

  @Mutation(() => DeletionResult, { name: 'deleteCertificateConfig' })
  @RequireScopes('certificate#edit')
  async deleteCertificateConfig(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertCertificateConfigMutable(id, this.getUser(context), 'delete');
    return this.configsService.deleteConfig(id);
  }

  @Mutation(() => Certificate, { name: 'issueCertificateForPerson' })
  @RequireScopes('certificate#edit')
  async issueCertificateForPerson(
    @Args('configId', { type: () => String }) configId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(configId, this.getUser(context), 'edit');
    return this.issuingService.issueForPerson(configId, personId, this.getIssuedById(context));
  }

  @Mutation(() => [Certificate], { name: 'issueMissedCertificates' })
  @RequireScopes('certificate#edit')
  async issueMissedCertificates(
    @Args('configId', { type: () => String }) configId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(configId, this.getUser(context), 'edit');
    return this.issuingService.issueMissedCertificates(configId, this.getIssuedById(context));
  }

  @Mutation(() => CertificateReissueResult, { name: 'reissueAllCertificates' })
  @RequireScopes('certificate#edit')
  async reissueAllCertificates(@Context() context: GraphqlContext) {
    await this.frozenResources.assertNoFrozenCertificateTargets(this.getUser(context), 'edit');
    return this.issuingService.reissueAllCertificates(this.getIssuedById(context));
  }

  @Mutation(() => DeletionResult, { name: 'deleteCertificate' })
  @RequireScopes('certificate#edit')
  async deleteCertificate(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertCertificateMutable(id, this.getUser(context), 'delete');
    return this.issuingService.deleteCertificate(id);
  }

  private getIssuedById(context: GraphqlContext): string | undefined {
    const user = this.getUser(context);
    const subject = user?.sub?.trim();
    return subject || undefined;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }

  private getCertificateTargetId(
    scope: CertificateScope,
    input: CertificateConfigCreateInput,
  ): string {
    if (scope === CertificateScope.EVENT && input.eventId) {
      return input.eventId;
    }

    if (scope === CertificateScope.EVENT_GROUP && input.eventGroupId) {
      return input.eventGroupId;
    }

    if (scope === CertificateScope.MAJOR_EVENT && input.majorEventId) {
      return input.majorEventId;
    }

    return '';
  }
}
