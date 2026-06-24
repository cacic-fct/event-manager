import { Field, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  AuditLogActorType,
  AuditLogEntityType,
  AuditLogOperation,
  AuditLogRevertMode,
} from '@prisma/client';

registerEnumType(AuditLogEntityType, {
  name: 'AuditLogEntityType',
});

registerEnumType(AuditLogOperation, {
  name: 'AuditLogOperation',
});

registerEnumType(AuditLogActorType, {
  name: 'AuditLogActorType',
});

registerEnumType(AuditLogRevertMode, {
  name: 'AuditLogRevertMode',
});

@ObjectType()
export class AuditLogChange {
  @Field(() => String)
  field!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true })
  beforeValue?: string | null;

  @Field(() => String, { nullable: true })
  afterValue?: string | null;
}

@ObjectType()
export class AuditLogEntry {
  @Field(() => String)
  id!: string;

  @Field(() => AuditLogEntityType)
  entityType!: AuditLogEntityType;

  @Field(() => String)
  entityId!: string;

  @Field(() => String, { nullable: true })
  entityLabel?: string | null;

  @Field(() => AuditLogOperation)
  operation!: AuditLogOperation;

  @Field(() => String, { nullable: true })
  summary?: string | null;

  @Field(() => String, { nullable: true })
  actorId?: string | null;

  @Field(() => String)
  actorName!: string;

  @Field(() => String, { nullable: true })
  actorEmail?: string | null;

  @Field(() => AuditLogActorType)
  actorType!: AuditLogActorType;

  @Field(() => String, { nullable: true })
  permission?: string | null;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => [AuditLogChange])
  changes!: AuditLogChange[];

  @Field(() => [String])
  changedFields!: string[];

  @Field(() => Int)
  groupedCount!: number;

  @Field(() => Date)
  firstRecordedAt!: Date;

  @Field(() => Date)
  lastRecordedAt!: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date, { nullable: true })
  revertedAt?: Date | null;

  @Field(() => String, { nullable: true })
  revertedById?: string | null;

  @Field(() => String, { nullable: true })
  revertedByName?: string | null;

  @Field(() => String, { nullable: true })
  revertedByEntryId?: string | null;

  @Field(() => String, { nullable: true })
  revertTargetId?: string | null;

  @Field(() => AuditLogRevertMode, { nullable: true })
  revertMode?: AuditLogRevertMode | null;

  @Field(() => Boolean)
  canRevert!: boolean;
}

@InputType()
export class AuditLogEntityHistoryInput {
  @Field(() => AuditLogEntityType)
  entityType!: AuditLogEntityType;

  @Field(() => String)
  entityId!: string;
}

@InputType()
export class AuditLogRevertInput {
  @Field(() => String)
  entryId!: string;

  @Field(() => AuditLogRevertMode)
  mode!: AuditLogRevertMode;
}
