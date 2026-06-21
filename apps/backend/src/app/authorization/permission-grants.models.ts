import { Field, InputType, ObjectType, registerEnumType } from '@nestjs/graphql';
import { EventManagerPermissionGrantScope } from '@prisma/client';

registerEnumType(EventManagerPermissionGrantScope, {
  name: 'EventManagerPermissionGrantScope',
});

@ObjectType()
export class EventManagerPermissionGrant {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  userId!: string;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String)
  permission!: string;

  @Field(() => EventManagerPermissionGrantScope)
  scope!: EventManagerPermissionGrantScope;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => String, { nullable: true })
  targetLabel?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;
}

@ObjectType()
export class EventManagerPermissionGrantTarget {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  emoji?: string | null;

  @Field(() => Date, { nullable: true })
  startDate?: Date | null;

  @Field(() => Date, { nullable: true })
  endDate?: Date | null;
}

@InputType()
export class EventManagerPermissionGrantCreateInput {
  @Field(() => String)
  userId!: string;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String)
  permission!: string;

  @Field(() => EventManagerPermissionGrantScope)
  scope!: EventManagerPermissionGrantScope;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;
}

@InputType()
export class EventManagerPermissionGrantUpdateInput {
  @Field(() => String)
  permission!: string;

  @Field(() => EventManagerPermissionGrantScope)
  scope!: EventManagerPermissionGrantScope;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => Date, { nullable: true })
  validFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  validUntil?: Date | null;
}
