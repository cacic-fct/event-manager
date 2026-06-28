import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  EventFormAudience,
  EventFormResponseMode,
  EventFormResponseSource,
  EventFormSigilo,
  EventFormTargetType,
  PublicationState,
} from './enums';

@ObjectType()
export class EventFormTargetSummary {
  @Field(() => EventFormTargetType)
  type!: EventFormTargetType;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  emoji?: string | null;
}

@ObjectType()
export class EventFormLink {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  formId!: string;

  @Field(() => EventFormTargetType)
  targetType!: EventFormTargetType;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => EventFormTargetSummary, { nullable: true })
  target?: EventFormTargetSummary | null;

  @Field(() => EventFormAudience)
  audience!: EventFormAudience;

  @Field(() => Boolean)
  insertInSubscriptionFlow!: boolean;

  @Field(() => Boolean)
  requiredInSubscriptionFlow!: boolean;

  @Field(() => Boolean)
  enforceRequiredAnswers!: boolean;

  @Field(() => Int)
  displayOrder!: number;

  @Field(() => Date, { nullable: true })
  availableFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  availableUntil?: Date | null;

  @Field(() => Boolean)
  notifyOnPublish!: boolean;

  @Field(() => Boolean)
  allowLecturerManualPublish!: boolean;

  @Field(() => Date, { nullable: true })
  lastNotifiedAt?: Date | null;

  @Field(() => Int)
  responseCount!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class EventForm {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  ownerEventId?: string | null;

  @Field(() => String, { nullable: true })
  ownerMajorEventId?: string | null;

  @Field(() => EventFormTargetSummary, { nullable: true })
  owner?: EventFormTargetSummary | null;

  @Field(() => String)
  elementsJson!: string;

  @Field(() => EventFormSigilo)
  sigilo!: EventFormSigilo;

  @Field(() => EventFormResponseMode)
  responseMode!: EventFormResponseMode;

  @Field(() => Boolean)
  resultsPublic!: boolean;

  @Field(() => Boolean)
  resultsLive!: boolean;

  @Field(() => PublicationState)
  publicationState!: PublicationState;

  @Field(() => Date, { nullable: true })
  scheduledPublishAt?: Date | null;

  @Field(() => Date, { nullable: true })
  publishedAt?: Date | null;

  @Field(() => Date, { nullable: true })
  unpublishedAt?: Date | null;

  @Field(() => [EventFormLink])
  links!: EventFormLink[];

  @Field(() => Int)
  responseCount!: number;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;

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
export class EventFormDraft {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  sourceFormId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  payloadJson!: string;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => String, { nullable: true })
  createdByName?: string | null;

  @Field(() => String, { nullable: true })
  createdByEmail?: string | null;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;

  @Field(() => String, { nullable: true })
  updatedByName?: string | null;

  @Field(() => String, { nullable: true })
  updatedByEmail?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date)
  expiresAt!: Date;
}

@ObjectType()
export class EventFormResponse {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  formId!: string;

  @Field(() => String, { nullable: true })
  linkId?: string | null;

  @Field(() => EventFormTargetType)
  targetType!: EventFormTargetType;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String, { nullable: true })
  respondentName?: string | null;

  @Field(() => String, { nullable: true })
  respondentEmail?: string | null;

  @Field(() => String)
  answersJson!: string;

  @Field(() => EventFormResponseSource)
  source!: EventFormResponseSource;

  @Field(() => Date, { nullable: true })
  submittedAt?: Date | null;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class EventFormResults {
  @Field(() => EventForm)
  form!: EventForm;

  @Field(() => Int)
  responseCount!: number;

  @Field(() => Boolean)
  anonymous!: boolean;

  @Field(() => Boolean)
  answersReleased!: boolean;

  @Field(() => String)
  summaryJson!: string;

  @Field(() => [EventFormResponse])
  responses!: EventFormResponse[];
}

@InputType()
export class EventFormLinkInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => EventFormTargetType)
  targetType!: EventFormTargetType;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => EventFormAudience, { nullable: true })
  audience?: EventFormAudience | null;

  @Field(() => Boolean, { nullable: true })
  insertInSubscriptionFlow?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  requiredInSubscriptionFlow?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  enforceRequiredAnswers?: boolean | null;

  @Field(() => Int, { nullable: true })
  displayOrder?: number | null;

  @Field(() => Date, { nullable: true })
  availableFrom?: Date | null;

  @Field(() => Date, { nullable: true })
  availableUntil?: Date | null;

  @Field(() => Boolean, { nullable: true })
  notifyOnPublish?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  allowLecturerManualPublish?: boolean | null;
}

@InputType()
export class EventFormInput {
  @Field(() => String, { nullable: true })
  id?: string | null;

  @Field(() => String, { nullable: true })
  name?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  ownerEventId?: string | null;

  @Field(() => String, { nullable: true })
  ownerMajorEventId?: string | null;

  @Field(() => String, { nullable: true })
  elementsJson?: string | null;

  @Field(() => EventFormSigilo, { nullable: true })
  sigilo?: EventFormSigilo | null;

  @Field(() => EventFormResponseMode, { nullable: true })
  responseMode?: EventFormResponseMode | null;

  @Field(() => Boolean, { nullable: true })
  resultsPublic?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  resultsLive?: boolean | null;

  @Field(() => [EventFormLinkInput], { nullable: true })
  links?: EventFormLinkInput[] | null;
}

@InputType()
export class EventFormDraftSaveInput {
  @Field(() => String)
  sourceFormId!: string;

  @Field(() => String, { nullable: true })
  draftId?: string | null;

  @Field(() => EventFormInput)
  input!: EventFormInput;
}

@InputType()
export class SubmitEventFormResponseInput {
  @Field(() => String)
  formId!: string;

  @Field(() => String, { nullable: true })
  linkId?: string | null;

  @Field(() => EventFormTargetType)
  targetType!: EventFormTargetType;

  @Field(() => String, { nullable: true })
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => String)
  answersJson!: string;

  @Field(() => EventFormResponseSource, { nullable: true })
  source?: EventFormResponseSource | null;
}

@InputType()
export class PublishEventFormInput {
  @Field(() => String)
  formId!: string;

  @Field(() => Date, { nullable: true })
  scheduledPublishAt?: Date | null;
}
