import { Field, Int, ObjectType } from '@nestjs/graphql';

import { CertificateIssuedTo, CertificateScope, EventType } from './enums';
import { Event } from './events';
import { EventGroup } from './event-groups';
import { MajorEvent } from './major-events';
import { Person } from './people';

@ObjectType()
export class CertificateTemplate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => Int)
  version!: number;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class CertificateConfig {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String, { nullable: true })
  majorEventId?: string;

  @Field(() => MajorEvent, { nullable: true })
  majorEvent?: MajorEvent;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => EventGroup, { nullable: true })
  eventGroup?: EventGroup;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => CertificateTemplate)
  certificateTemplate!: CertificateTemplate;

  @Field(() => String, { nullable: true })
  certificateText?: string;

  @Field(() => Boolean)
  shouldAutofillSecondPage!: boolean;

  @Field(() => String, { nullable: true })
  secondPageText?: string;

  @Field(() => Boolean)
  isActive!: boolean;

  @Field(() => CertificateIssuedTo)
  issuedTo!: CertificateIssuedTo;

  @Field(() => String, { nullable: true })
  certificateFieldsJson?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class Certificate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person)
  person!: Person;

  @Field(() => String)
  configId!: string;

  @Field(() => CertificateConfig)
  config!: CertificateConfig;

  @Field(() => String)
  renderedDataJson!: string;

  @Field(() => Date)
  issuedAt!: Date;

  @Field(() => String, { nullable: true })
  issuedById?: string;

  @Field(() => String)
  certificateTemplateId!: string;

  @Field(() => CertificateTemplate)
  certificateTemplate!: CertificateTemplate;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;
}

@ObjectType()
export class CertificateDownload {
  @Field(() => String)
  fileName!: string;

  @Field(() => String)
  mimeType!: string;

  @Field(() => String)
  contentBase64!: string;
}

@ObjectType()
export class CertificateReissueResult {
  @Field(() => Int)
  configCount!: number;

  @Field(() => Int)
  certificateCount!: number;
}

@ObjectType()
export class PublicCertificateValidationEvent {
  @Field(() => String)
  name!: string;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number;
}

@ObjectType()
export class PublicCertificateValidationEventSection {
  @Field(() => String)
  title!: string;

  @Field(() => EventType, { nullable: true })
  type?: EventType;

  @Field(() => Int)
  creditMinutes!: number;

  @Field(() => [PublicCertificateValidationEvent])
  events!: PublicCertificateValidationEvent[];
}

@ObjectType()
export class PublicCertificateValidation {
  @Field(() => String)
  id!: string;

  @Field(() => Date)
  issuedAt!: Date;

  @Field(() => String)
  personName!: string;

  @Field(() => String, { nullable: true })
  maskedIdentityDocument?: string;

  @Field(() => CertificateScope)
  scope!: CertificateScope;

  @Field(() => String)
  certificateName!: string;

  @Field(() => String, { nullable: true })
  targetName?: string;

  @Field(() => String, { nullable: true })
  targetEmoji?: string;

  @Field(() => [PublicCertificateValidationEventSection])
  sections!: PublicCertificateValidationEventSection[];

  @Field(() => Int)
  totalCreditMinutes!: number;
}
