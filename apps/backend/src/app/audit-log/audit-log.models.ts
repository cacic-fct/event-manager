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
  @Field()
  field!: string;

  @Field()
  label!: string;

  @Field({ nullable: true })
  beforeValue?: string | null;

  @Field({ nullable: true })
  afterValue?: string | null;
}

@ObjectType()
export class AuditLogEntry {
  @Field()
  id!: string;

  @Field(() => AuditLogEntityType)
  entityType!: AuditLogEntityType;

  @Field()
  entityId!: string;

  @Field({ nullable: true })
  entityLabel?: string | null;

  @Field(() => AuditLogOperation)
  operation!: AuditLogOperation;

  @Field({ nullable: true })
  summary?: string | null;

  @Field({ nullable: true })
  actorId?: string | null;

  @Field()
  actorName!: string;

  @Field({ nullable: true })
  actorEmail?: string | null;

  @Field(() => AuditLogActorType)
  actorType!: AuditLogActorType;

  @Field({ nullable: true })
  permission?: string | null;

  @Field({ nullable: true })
  eventId?: string | null;

  @Field({ nullable: true })
  majorEventId?: string | null;

  @Field({ nullable: true })
  eventGroupId?: string | null;

  @Field(() => [AuditLogChange])
  changes!: AuditLogChange[];

  @Field(() => [String])
  changedFields!: string[];

  @Field(() => Int)
  groupedCount!: number;

  @Field()
  firstRecordedAt!: Date;

  @Field()
  lastRecordedAt!: Date;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  revertedAt?: Date | null;

  @Field({ nullable: true })
  revertedById?: string | null;

  @Field({ nullable: true })
  revertedByName?: string | null;

  @Field({ nullable: true })
  revertedByEntryId?: string | null;

  @Field({ nullable: true })
  revertTargetId?: string | null;

  @Field(() => AuditLogRevertMode, { nullable: true })
  revertMode?: AuditLogRevertMode | null;

  @Field()
  canRevert!: boolean;
}

@InputType()
export class AuditLogEntityHistoryInput {
  @Field(() => AuditLogEntityType)
  entityType!: AuditLogEntityType;

  @Field()
  entityId!: string;
}

@InputType()
export class AuditLogRevertInput {
  @Field()
  entryId!: string;

  @Field(() => AuditLogRevertMode)
  mode!: AuditLogRevertMode;
}
