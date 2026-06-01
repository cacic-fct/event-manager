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

@ObjectType({
  description:
    'Participant-safe event row shown inside public certificate validation, without attendance or administrative data.',
})
export class PublicCertificateValidationEvent {
  @Field(() => String, {
    description: 'Participant-facing event name credited by the certificate.',
  })
  name!: string;

  @Field(() => String, {
    description: 'Public event identifier credited by the certificate.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Visual marker used by public certificate validation UI.',
  })
  emoji!: string;

  @Field(() => Date, {
    description: 'Start date of the credited event.',
  })
  startDate!: Date;

  @Field(() => Date, {
    description: 'End date of the credited event.',
  })
  endDate!: Date;

  @Field(() => Int, {
    nullable: true,
    description: 'Credit workload for this event in minutes. Null means this event does not expose an individual workload.',
  })
  creditMinutes?: number;
}

@ObjectType({
  description:
    'Grouped event credit section for public certificate validation. Sections mirror project certificate rules such as courses, lectures, groups, or major-event totals.',
})
export class PublicCertificateValidationEventSection {
  @Field(() => String, {
    description: 'Display title for this validation section.',
  })
  title!: string;

  @Field(() => EventType, {
    nullable: true,
    description: 'Event category represented by this section when the section maps to one event type.',
  })
  type?: EventType;

  @Field(() => Int, {
    description: 'Total credit workload represented by this section in minutes.',
  })
  creditMinutes!: number;

  @Field(() => [PublicCertificateValidationEvent], {
    description: 'Credited events included in this section.',
  })
  events!: PublicCertificateValidationEvent[];
}

@ObjectType({
  description:
    'Public certificate validation payload used by QR-code and verification pages. It exposes authenticity, participant-safe identity, target, credited events, and workload totals.',
})
export class PublicCertificateValidation {
  @Field(() => String, {
    description: 'Certificate identifier being validated.',
  })
  id!: string;

  @Field(() => Date, {
    description: 'Date and time when the certificate was issued.',
  })
  issuedAt!: Date;

  @Field(() => String, {
    description: 'Name printed on the certificate.',
  })
  personName!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Masked identity document, when available, for participant-side authenticity checks.',
  })
  maskedIdentityDocument?: string;

  @Field(() => CertificateScope, {
    description: 'Certificate scope: major event, event group, or individual event.',
  })
  scope!: CertificateScope;

  @Field(() => String, {
    description: 'Configured certificate name shown to users during validation.',
  })
  certificateName!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Name of the event, event group, or major event that the certificate targets.',
  })
  targetName?: string;

  @Field(() => String, {
    nullable: true,
    description: 'Visual marker for the event, event group, or major event that the certificate targets.',
  })
  targetEmoji?: string;

  @Field(() => [PublicCertificateValidationEventSection], {
    description: 'Credited workload grouped according to the certificate scope and project certificate rules.',
  })
  sections!: PublicCertificateValidationEventSection[];

  @Field(() => Int, {
    description: 'Total credited workload for the certificate in minutes.',
  })
  totalCreditMinutes!: number;
}
