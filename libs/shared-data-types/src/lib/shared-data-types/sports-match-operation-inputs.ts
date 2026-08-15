import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';

import {
  SportsLossReason,
  SportsMatchActionType,
  SportsOfficialRole,
  SportsReviewStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsScoreEntrySource,
} from './sports-enums';
import { SportsScoreboardInput } from './sports-competition-inputs';

@InputType()
export class SportsMatchFinalizeInput {
  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => Boolean)
  draw!: boolean;

  @Field(() => Boolean, { nullable: true })
  drawWillReschedule?: boolean | null;

  @Field(() => String, { nullable: true })
  winnerRegistrationId?: string | null;

  @Field(() => String, { nullable: true })
  loserRegistrationId?: string | null;

  @Field(() => SportsLossReason, { nullable: true })
  lossReason?: SportsLossReason | null;

  @Field(() => String, { nullable: true })
  lossReasonDetail?: string | null;

  @Field(() => SportsScoreboardInput, { nullable: true })
  scoreboard?: SportsScoreboardInput | null;
}

@InputType()
export class SportsRosterEntryInput {
  @Field(() => String)
  registrationMemberId!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Optional team-member fallback used by trusted administrative roster edits.',
  })
  teamMemberId?: string | null;

  @Field(() => SportsRosterRole, { nullable: true })
  role?: SportsRosterRole;

  @Field(() => SportsRosterEntryStatus, { nullable: true })
  status?: SportsRosterEntryStatus;

  @Field(() => String, { nullable: true })
  shirtNumber?: string | null;

  @Field(() => String, { nullable: true })
  roleMetadataJson?: string | null;
}

@InputType()
export class SportsMatchRosterUpsertInput {
  @Field(() => String)
  matchId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => Int, { nullable: true })
  expectedRevision?: number;

  @Field(() => SportsRosterStatus, { nullable: true })
  status?: SportsRosterStatus;

  @Field(() => [SportsRosterEntryInput])
  entries!: SportsRosterEntryInput[];
}

@InputType()
export class SportsMatchRosterCopyInput {
  @Field(() => String)
  sourceRosterId!: string;

  @Field(() => String)
  destinationMatchId!: string;

  @Field(() => Boolean, { nullable: true })
  replaceDraft?: boolean;
}

@InputType()
export class SportsRosterCheckInInput {
  @Field(() => String, {
    description:
      'Client-generated idempotency key. Replaying the same key and payload is safe; reusing it for another check-in is rejected.',
  })
  clientId!: string;

  @Field(() => String)
  rosterEntryId!: string;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Pessoa que coletou originalmente um check-in off-line. Exige credencial assinada correspondente.',
  })
  collectorPersonId?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Credencial durável, assinada pelo servidor e vinculada à pessoa coletora e à partida.',
  })
  collectorCredential?: string | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether the player is present. False safely reverses an accidental check-in.',
  })
  present?: boolean;
}

@InputType()
export class SportsOfficialCheckInInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  officialAssignmentId!: string;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Pessoa que operou o check-in off-line. Exige credencial assinada correspondente.',
  })
  collectorPersonId?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Credencial durável, assinada pelo servidor e vinculada à pessoa coletora e à partida.',
  })
  collectorCredential?: string | null;
}

@InputType()
export class SportsRosterScannerCheckInInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String, { description: 'Código Aztec do usuário lido pelo scanner.' })
  code!: string;

  @Field(() => Date, { nullable: true })
  checkedInAt?: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Pessoa que operou o scanner off-line. Exige credencial assinada correspondente.',
  })
  collectorPersonId?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Credencial durável, assinada pelo servidor e vinculada à pessoa coletora e à partida.',
  })
  collectorCredential?: string | null;
}

@ObjectType()
export class SportsOfflineCollectorCredential {
  @Field(() => String)
  credential!: string;

  @Field(() => String)
  collectorPersonId!: string;

  @Field(() => Date)
  issuedAt!: Date;
}

@InputType()
export class SportsOfficialAssignInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String, { nullable: true })
  matchId?: string | null;

  @Field(() => String)
  personId!: string;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;
}

@InputType()
export class SportsOfficialUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => SportsOfficialRole, { nullable: true })
  role?: SportsOfficialRole;

  @Field(() => Boolean, { nullable: true })
  active?: boolean;
}

@InputType()
export class SportsMatchActionInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  matchId!: string;

  @Field(() => Int)
  baseRevision!: number;

  @Field(() => SportsMatchActionType)
  type!: SportsMatchActionType;

  @Field(() => String)
  payloadJson!: string;

  @Field(() => String, { nullable: true })
  scorerRosterEntryId?: string | null;

  @Field(() => Date)
  authoredAt!: Date;

  @Field(() => Boolean, { nullable: true })
  offline?: boolean;
}

@InputType()
export class CommitSportsMatchActionsInput {
  @Field(() => [SportsMatchActionInput])
  actions!: SportsMatchActionInput[];
}

@InputType()
export class SportsMatchActionReviewInput {
  @Field(() => String)
  actionId!: string;

  @Field(() => SportsReviewStatus)
  decision!: SportsReviewStatus;

  @Field(() => String, { nullable: true })
  reviewMessage?: string | null;

  @Field(() => String, { nullable: true })
  correctedPayloadJson?: string | null;
}

@InputType()
export class SportsCategoryPlacementInput {
  @Field(() => String)
  categoryId!: string;

  @Field(() => String)
  registrationId!: string;

  @Field(() => String, { nullable: true })
  sourceMatchId?: string | null;

  @Field(() => Int)
  placement!: number;

  @Field(() => Int, { nullable: true })
  pointsAwarded?: number | null;
}

@InputType()
export class SportsTournamentScoreEntryInput {
  @Field(() => String)
  tournamentId!: string;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String)
  teamId!: string;

  @Field(() => String, { nullable: true })
  sourceMatchId?: string | null;

  @Field(() => SportsScoreEntrySource)
  source!: SportsScoreEntrySource;

  @Field(() => Int)
  points!: number;

  @Field(() => String)
  reason!: string;
}

@InputType()
export class SportsTournamentScoreEntryUpdateInput {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  tournamentId!: string;

  @Field(() => Int)
  expectedRevision!: number;

  @Field(() => String, { nullable: true })
  categoryId?: string | null;

  @Field(() => String, { nullable: true })
  teamId?: string;

  @Field(() => SportsScoreEntrySource, { nullable: true })
  source?: SportsScoreEntrySource;

  @Field(() => Int, { nullable: true })
  points?: number;

  @Field(() => String, { nullable: true })
  reason?: string;
}
