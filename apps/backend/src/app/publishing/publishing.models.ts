import { Field, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { DashboardInconsistency } from '../dashboard/models';
import { PublicEvent, PublicEventGroup, PublicMajorEvent } from '../public-events/models';

export const PublicationBulkOperation = {
  PUBLISH_MISSING_CHILDREN: 'PUBLISH_MISSING_CHILDREN',
  SCHEDULE_BUNDLE: 'SCHEDULE_BUNDLE',
  UNPUBLISH_BUNDLE: 'UNPUBLISH_BUNDLE',
} as const;
export type PublicationBulkOperation = (typeof PublicationBulkOperation)[keyof typeof PublicationBulkOperation];
registerEnumType(PublicationBulkOperation, {
  name: 'PublicationBulkOperation',
});

@ObjectType()
export class PublicContentNode {
  @Field(() => PublicationTargetType)
  targetType!: PublicationTargetType;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  label!: string;

  @Field(() => PublicationState)
  publicationState!: PublicationState;

  @Field(() => String)
  statusLabel!: string;

  @Field(() => Date, { nullable: true })
  scheduledPublishAt?: Date | null;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  unpublishedAt?: Date | null;

  @Field(() => Boolean, { nullable: true })
  publiclyVisible?: boolean | null;

  @Field(() => String, { nullable: true })
  parentLabel?: string | null;

  @Field(() => Int)
  childCount!: number;

  @Field(() => [PublicContentNode])
  children!: PublicContentNode[];
}

@ObjectType()
export class PublicContentWorkspace {
  @Field(() => Date)
  generatedAt!: Date;

  @Field(() => [PublicContentNode])
  tree!: PublicContentNode[];

  @Field(() => [PublicContentNode])
  items!: PublicContentNode[];

  @Field(() => Int)
  totalCount!: number;

  @Field(() => Int)
  skip!: number;

  @Field(() => Int)
  take!: number;

  @Field(() => Boolean)
  hasMore!: boolean;

  @Field(() => String, { nullable: true })
  query?: string | null;

  @Field(() => [DashboardInconsistency])
  warnings!: DashboardInconsistency[];
}

@InputType()
export class PublicationStateInput {
  @Field(() => PublicationTargetType)
  targetType!: PublicationTargetType;

  @Field(() => String)
  targetId!: string;

  @Field(() => PublicationState)
  state!: PublicationState;

  @Field(() => Date, { nullable: true })
  scheduledPublishAt?: Date | null;
}

@InputType()
export class PublicationBulkInput {
  @Field(() => PublicationTargetType)
  targetType!: PublicationTargetType;

  @Field(() => String)
  targetId!: string;

  @Field(() => PublicationBulkOperation)
  operation!: PublicationBulkOperation;

  @Field(() => Date, { nullable: true })
  scheduledPublishAt?: Date | null;
}

@InputType()
export class PublicContentPreviewInput {
  @Field(() => PublicationTargetType)
  targetType!: PublicationTargetType;

  @Field(() => String)
  targetId!: string;

  @Field(() => Date, { nullable: true })
  previewAt?: Date | null;
}

@ObjectType()
export class PublicationActionResult {
  @Field(() => Boolean)
  ok!: boolean;

  @Field(() => String)
  message!: string;

  @Field(() => [String])
  affectedEventIds!: string[];

  @Field(() => [String])
  affectedMajorEventIds!: string[];
}

@ObjectType()
export class PublicContentPreviewResult {
  @Field(() => String)
  url!: string;

  @Field(() => Boolean)
  directPublicUrl!: boolean;

  @Field(() => Date, { nullable: true })
  expiresAt?: Date | null;

  @Field(() => String)
  message!: string;
}

@ObjectType()
export class PublicContentPreviewPayload {
  @Field(() => PublicationTargetType)
  targetType!: PublicationTargetType;

  @Field(() => String)
  targetId!: string;

  @Field(() => Date)
  previewAt!: Date;

  @Field(() => Date)
  expiresAt!: Date;

  @Field(() => PublicEvent, { nullable: true })
  event?: PublicEvent | null;

  @Field(() => PublicEventGroup, { nullable: true })
  eventGroup?: PublicEventGroup | null;

  @Field(() => PublicMajorEvent, { nullable: true })
  majorEvent?: PublicMajorEvent | null;

  @Field(() => [PublicEvent])
  events!: PublicEvent[];
}
