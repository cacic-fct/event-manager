import {
  CommitSportsMatchActionsInput,
  SportsMatchRosterUpsertInput,
  SportsOfflineCollectorCredential,
  SportsOfficialCheckInInput,
  SportsAthleteProfileUpdateInput,
  SportsPlayerApplicationCreateInput,
  SportsRepresentativeApplicationReviewInput,
  SportsRosterCheckInInput,
  SportsRosterScannerCheckInInput,
  SportsTeamChangeRequestInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { Prisma, SportsMatchActionType } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { GraphqlContext } from '../current-user/selects';
import { createSportsAuditActor } from './operations/sports-match-operation.service';
import { issueSportsOfflineCollectorCredential } from './security/sports-offline-collector-credential';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

@Resolver()
export class SportsParticipantMutationsResolver extends SportsMutationsResolverSupport {
  @Mutation(() => String, { name: 'updateCurrentUserSportsAthleteProfile' })
  async updateCurrentUserAthleteProfile(
    @Args('input', { type: () => SportsAthleteProfileUpdateInput })
    input: SportsAthleteProfileUpdateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const person = await this.currentUser.requireCurrentPerson(context);
    const actor = this.authenticated(context);
    const published = await this.publishMutation(
      'REGISTRATION',
      this.admin
        .updateOwnAthleteProfile(
          input.registrationMemberId,
          person.id,
          {
            gameNickname: input.gameNickname,
            gameAccountName: input.gameAccountName,
            gameAccountUrl: input.gameAccountUrl,
          },
          actor,
        )
        .then((profile) => ({ id: profile.registrationId, profileId: profile.id })),
      true,
    );
    return published.profileId;
  }

  @Mutation(() => SportsOfflineCollectorCredential, { name: 'createSportsOfflineCollectorCredential' })
  async createOfflineCollectorCredential(
    @Args('matchId', { type: () => String }) matchId: string,
    @Context() context: GraphqlContext,
  ): Promise<SportsOfflineCollectorCredential> {
    const operator = await this.access.requireMatchOperator(context, matchId);
    const authenticated = this.authenticated(context);
    const collectorUserId = operator.actor.userId ?? authenticated.sub;
    if (!collectorUserId) {
      throw new BadRequestException('A pessoa coletora não possui uma conta vinculada.');
    }
    return issueSportsOfflineCollectorCredential({
      matchId,
      collectorPersonId: operator.actor.id,
      collectorUserId,
      collectorRole: operator.kind === 'ADMIN' ? 'ADMIN' : operator.assignment.role,
      collectorKind: operator.kind,
    });
  }

  @Mutation(() => String, { name: 'submitSportsTeamChange' })
  async submitTeamChange(
    @Args('input', { type: () => SportsTeamChangeRequestInput })
    input: SportsTeamChangeRequestInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const { actor } = await this.access.requireTeamRepresentative(context, input.teamId);
    const delta = this.parseObject(input.deltaJson, 'alterações da equipe');
    return (
      await this.publishMutation(
        'TEAM_CHANGE',
        this.teamChanges.submit(input.teamId, actor.id, {
          type: input.type,
          baseRevision: input.baseRevision,
          expectedRequestRevision: input.expectedRequestRevision,
          delta,
          identities: input.identityClaims?.map((identity) => ({
            clientKey: identity.clientKey,
            type: identity.type,
            value: identity.value,
          })),
        }),
        false,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'submitSportsPlayerApplication' })
  async submitPlayerApplication(
    @Args('input', { type: () => SportsPlayerApplicationCreateInput })
    input: SportsPlayerApplicationCreateInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const person = await this.currentUser.requireCurrentPerson(context);
    const actor = this.authenticated(context);
    return (
      await this.publishMutation('APPLICATION', this.applications.submitSelfApplication(input, person.id, actor), false)
    ).id;
  }

  @Mutation(() => String, {
    name: 'reviewRepresentativeSportsPlayerApplication',
  })
  async reviewRepresentativePlayerApplication(
    @Args('input', {
      type: () => SportsRepresentativeApplicationReviewInput,
    })
    input: SportsRepresentativeApplicationReviewInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    await this.access.requireTeamRepresentative(context, input.teamId);
    return (
      await this.applications.reviewByRepresentative(
        input.applicationId,
        input.teamId,
        input.approved,
        this.authenticated(context),
        input.reviewMessage,
      )
    ).id;
  }

  @Mutation(() => String, { name: 'submitSportsMatchRoster' })
  async submitRoster(
    @Args('input', { type: () => SportsMatchRosterUpsertInput })
    input: SportsMatchRosterUpsertInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const { actor } = await this.access.requireRosterManager(context, input.registrationId);
    return (
      await this.rosters.upsert(
        {
          matchId: input.matchId,
          registrationId: input.registrationId,
          expectedRevision: input.expectedRevision,
          entries: input.entries.map((entry) => ({
            registrationMemberId: entry.registrationMemberId,
            role: entry.role ?? 'PLAYER',
            shirtNumber: entry.shirtNumber,
            roleMetadata:
              entry.roleMetadataJson === null
                ? Prisma.DbNull
                : entry.roleMetadataJson === undefined
                  ? undefined
                  : this.parseJson(entry.roleMetadataJson, 'metadados da função na escalação'),
          })),
        },
        actor.id,
        createSportsAuditActor(actor),
        false,
      )
    ).id;
  }

  @Mutation(() => Boolean, { name: 'checkInSportsRosterEntry' })
  async checkInRosterEntry(
    @Args('matchId', { type: () => String }) matchId: string,
    @Args('input', { type: () => SportsRosterCheckInInput })
    input: SportsRosterCheckInInput,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const operator = await this.access.requireMatchOperator(context, matchId);
    const authenticated = this.authenticated(context);
    const uploaderUserId = operator.actor.userId ?? authenticated.sub ?? null;
    if (operator.kind === 'ADMIN') {
      await this.assertMatchMutable(matchId, authenticated);
    }
    await this.rosters.checkIn(
      matchId,
      input.rosterEntryId,
      input.checkedInAt,
      input.clientId,
      input.offline ?? false,
      input.present ?? true,
      operator.actor.id,
      uploaderUserId,
      operator.kind === 'ADMIN' ? 'ADMIN' : operator.assignment.role,
      operator.kind === 'ADMIN' ? authenticated : createSportsAuditActor(operator.actor),
      {
        collectorPersonId: input.collectorPersonId,
        collectorCredential: input.collectorCredential,
      },
    );
    return true;
  }

  @Mutation(() => Boolean, { name: 'checkInSportsOfficial' })
  async checkInSportsOfficial(
    @Args('matchId', { type: () => String }) matchId: string,
    @Args('input', { type: () => SportsOfficialCheckInInput })
    input: SportsOfficialCheckInInput,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const operator = await this.access.requireMatchOperator(context, matchId);
    const authenticated = this.authenticated(context);
    const uploaderUserId = operator.actor.userId ?? authenticated.sub ?? null;
    if (operator.kind === 'ADMIN') {
      await this.assertMatchMutable(matchId, authenticated);
    }
    await this.rosters.checkInOfficial(
      matchId,
      input.officialAssignmentId,
      input.checkedInAt,
      input.clientId,
      input.offline ?? false,
      input.present ?? true,
      operator.actor.id,
      uploaderUserId,
      operator.kind === 'ADMIN' ? 'ADMIN' : operator.assignment.role,
      operator.kind === 'ADMIN' ? authenticated : createSportsAuditActor(operator.actor),
      {
        collectorPersonId: input.collectorPersonId,
        collectorCredential: input.collectorCredential,
      },
    );
    return true;
  }

  @Mutation(() => Boolean, { name: 'checkInSportsMatchFromScannerCode' })
  async checkInSportsMatchFromScannerCode(
    @Args('matchId', { type: () => String }) matchId: string,
    @Args('input', { type: () => SportsRosterScannerCheckInInput })
    input: SportsRosterScannerCheckInInput,
    @Context() context: GraphqlContext,
  ): Promise<boolean> {
    const operator = await this.access.requireMatchOperator(context, matchId);
    const authenticated = this.authenticated(context);
    const uploaderUserId = operator.actor.userId ?? authenticated.sub ?? null;
    if (operator.kind === 'ADMIN') {
      await this.assertMatchMutable(matchId, authenticated);
    }
    await this.rosters.checkInFromScanner(
      matchId,
      input.code,
      input.checkedInAt,
      input.clientId,
      input.offline ?? false,
      operator.actor.id,
      uploaderUserId,
      operator.kind === 'ADMIN' ? 'ADMIN' : operator.assignment.role,
      operator.kind === 'ADMIN' ? authenticated : createSportsAuditActor(operator.actor),
      {
        collectorPersonId: input.collectorPersonId,
        collectorCredential: input.collectorCredential,
      },
    );
    return true;
  }

  @Mutation(() => [String], { name: 'commitSportsMatchActions' })
  async commitMatchActions(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const matchId = this.singleMatchId(input);
    const operator = await this.access.requireMatchOperator(context, matchId);
    const authenticated = this.authenticated(context);
    return (
      await this.operations.commit(
        input.actions.map((action) => ({
          ...action,
          payload: this.parseJson(action.payloadJson, 'ação da partida'),
        })),
        {
          personId: operator.kind === 'ADMIN' ? undefined : operator.actor.id,
          userId: authenticated.sub,
          role: operator.kind === 'ADMIN' ? 'ADMIN' : operator.assignment.role,
          kind: operator.kind,
          auditActor: operator.kind === 'ADMIN' ? authenticated : createSportsAuditActor(operator.actor),
        },
      )
    ).map((action) => action.id);
  }

  @Mutation(() => [String], { name: 'commitAdminSportsMatchActions' })
  @RequirePermissions(Permission.SportsMatch.Operate)
  async commitAdminMatchActions(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string[]> {
    const matchId = this.singleMatchId(input);
    const actor = this.authenticated(context);
    await this.policy.assertPermissions(actor, [Permission.SportsMatch.Operate], {
      sportsMatchId: matchId,
    });
    await this.assertMatchMutable(matchId, actor);
    return (
      await this.operations.commit(
        input.actions.map((action) => ({
          ...action,
          payload: this.parseJson(action.payloadJson, 'ação da partida'),
        })),
        {
          userId: actor.sub,
          role: 'ADMIN',
          kind: 'ADMIN',
          auditActor: actor,
        },
      )
    ).map((action) => action.id);
  }

  @Mutation(() => String, { name: 'forfeitSportsMatch' })
  async forfeitMatch(
    @Args('input', { type: () => CommitSportsMatchActionsInput })
    input: CommitSportsMatchActionsInput,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    if (input.actions.length !== 1 || input.actions[0].type !== SportsMatchActionType.FORFEIT) {
      throw new BadRequestException('Envie uma única ação de desistência.');
    }
    const action = input.actions[0];
    const payload = this.parseObject(action.payloadJson, 'desistência');
    const registrationId = this.readString(payload['loserRegistrationId']);
    if (!registrationId) {
      throw new BadRequestException('Informe a equipe que está desistindo.');
    }
    const { actor, assignment } = await this.access.requireLineupManager(context, registrationId);
    return (
      await this.operations.commit([{ ...action, payload }], {
        personId: actor.id,
        userId: this.authenticated(context).sub,
        role: assignment.role,
        kind: 'LINEUP_MANAGER',
        auditActor: createSportsAuditActor(actor),
      })
    )[0].id;
  }
}
