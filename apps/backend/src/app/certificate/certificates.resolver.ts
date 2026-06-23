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
import { Permission } from '@cacic-fct/shared-permissions';
import { TURNSTILE_ACTIONS } from '@cacic-fct/shared-utils';
import { UseGuards } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { GqlThrottlerGuard } from '../common/gql-throttler.guard';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { CertificateConfigsService } from './certificate-configs.service';
import { CertificateDownloadService } from './certificate-download.service';
import { CertificateIssuingService } from './certificate-issuing.service';
import { CertificateTargetsService } from './certificate-targets.service';
import { PublicCertificateValidationService } from './public-certificate-validation.service';
import { TurnstileService } from '../turnstile/turnstile.service';

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
    private readonly turnstile: TurnstileService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  @Query(() => [Event], { name: 'certificateIssuableEvents' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.CertificateConfig.Read)
  async certificateIssuableEvents(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(
      this.getUser(context),
      Permission.CertificateConfig.Read,
    );
    return this.targetsService.listIssuableEvents(query, pagination.skip, pagination.take, accessibleTargets);
  }

  @Query(() => [EventGroup], { name: 'certificateIssuableEventGroups' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.CertificateConfig.Read)
  async certificateIssuableEventGroups(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(
      this.getUser(context),
      Permission.CertificateConfig.Read,
    );
    return this.targetsService.listIssuableEventGroups(query, pagination.skip, pagination.take, accessibleTargets);
  }

  @Query(() => [MajorEvent], { name: 'certificateIssuableMajorEvents' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.CertificateConfig.Read)
  async certificateIssuableMajorEvents(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const accessibleTargets = await this.authorizationPolicy.accessibleEventTargets(
      this.getUser(context),
      Permission.CertificateConfig.Read,
    );
    return this.targetsService.listIssuableMajorEvents(query, pagination.skip, pagination.take, accessibleTargets);
  }

  @Query(() => [CertificateTemplate], { name: 'certificateTemplates' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.CertificateConfig.Read)
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
  @RequirePermissions(Permission.CertificateConfig.Read)
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
  @RequirePermissions(Permission.Certificate.Read)
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
  @RequirePermissions(Permission.Certificate.Read)
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
  async publicCertificateValidation(
    @Args('certificateId', {
      type: () => String,
      description: 'Certificate identifier printed in certificate verification links and QR codes.',
    })
    certificateId: string,
    @Args('turnstileToken', {
      type: () => String,
      nullable: true,
      description: 'Cloudflare Turnstile token required before public certificate lookup.',
    })
    turnstileToken: string | null | undefined,
    @Context() context: GraphqlContext,
  ) {
    await this.turnstile.assertValidToken(
      turnstileToken,
      context.req ?? context.request,
      TURNSTILE_ACTIONS.certificateValidation,
    );
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
  @RequirePermissions(Permission.CertificateConfig.Create)
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
  @RequirePermissions(Permission.CertificateConfig.Update)
  async updateCertificateConfig(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => CertificateConfigUpdateInput })
    input: CertificateConfigUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(id, this.getUser(context), 'edit');
    await this.assertReplacementCertificateConfigTarget(id, input, context);
    return this.configsService.updateConfig(id, input);
  }

  @Mutation(() => DeletionResult, { name: 'deleteCertificateConfig' })
  @RequirePermissions(Permission.CertificateConfig.Delete)
  async deleteCertificateConfig(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertCertificateConfigMutable(id, this.getUser(context), 'delete');
    return this.configsService.deleteConfig(id);
  }

  @Mutation(() => Certificate, { name: 'issueCertificateForPerson' })
  @RequirePermissions(Permission.Certificate.Issue)
  async issueCertificateForPerson(
    @Args('configId', { type: () => String }) configId: string,
    @Args('personId', { type: () => String }) personId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(configId, this.getUser(context), 'edit');
    return this.issuingService.issueForPerson(configId, personId, this.getIssuedById(context));
  }

  @Mutation(() => [Certificate], { name: 'issueMissedCertificates' })
  @RequirePermissions(Permission.Certificate.Issue)
  async issueMissedCertificates(
    @Args('configId', { type: () => String }) configId: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertCertificateConfigMutable(configId, this.getUser(context), 'edit');
    return this.issuingService.issueMissedCertificates(configId, this.getIssuedById(context));
  }

  @Mutation(() => CertificateReissueResult, { name: 'reissueAllCertificates' })
  @RequirePermissions(Permission.Certificate.Reissue)
  async reissueAllCertificates(@Context() context: GraphqlContext) {
    await this.frozenResources.assertNoFrozenCertificateTargets(this.getUser(context), 'edit');
    return this.issuingService.reissueAllCertificates(this.getIssuedById(context));
  }

  @Mutation(() => DeletionResult, { name: 'deleteCertificate' })
  @RequirePermissions(Permission.Certificate.Delete)
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
    input: Pick<CertificateConfigCreateInput, 'eventId' | 'eventGroupId' | 'majorEventId'>,
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

  private async assertReplacementCertificateConfigTarget(
    id: string,
    input: CertificateConfigUpdateInput,
    context: GraphqlContext,
  ): Promise<void> {
    const changesTarget =
      input.scope !== undefined ||
      input.eventId !== undefined ||
      input.eventGroupId !== undefined ||
      input.majorEventId !== undefined;
    if (!changesTarget) {
      return;
    }

    const existing = await this.configsService.getConfigById(id);
    const scope = input.scope ?? existing.scope;
    const targetId = this.getCertificateTargetId(scope, {
      eventId: input.eventId === undefined ? existing.eventId : input.eventId,
      eventGroupId: input.eventGroupId === undefined ? existing.eventGroupId : input.eventGroupId,
      majorEventId: input.majorEventId === undefined ? existing.majorEventId : input.majorEventId,
    });
    if (!targetId) {
      return;
    }

    const user = this.getUser(context);
    await this.frozenResources.assertCertificateTargetMutable(scope, targetId, user, 'edit');
    await this.authorizationPolicy.assertPermissions(user, [Permission.CertificateConfig.Update], {
      scope,
      targetId,
    });
  }
}
