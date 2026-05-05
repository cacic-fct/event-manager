import { ContactType, EventType } from '@cacic-eventos/shared-data-types';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';

export const PUBLIC_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  isPaymentRequired: true,
  additionalPaymentInfo: true,
  certificateConfigs: {
    where: {
      deletedAt: null,
      isActive: true,
    },
    select: {
      id: true,
    },
    take: 1,
  },
} satisfies Prisma.MajorEventSelect;

export const PUBLIC_EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
} satisfies Prisma.EventGroupSelect;

export const PUBLIC_EVENT_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: PUBLIC_MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: PUBLIC_EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  shouldIssueCertificate: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
} satisfies Prisma.EventSelect;

export type PublicMajorEventRecord = Prisma.MajorEventGetPayload<{
  select: typeof PUBLIC_MAJOR_EVENT_SELECT;
}>;

export function mapPublicMajorEvent(
  majorEvent: PublicMajorEventRecord,
): PublicMajorEvent {
  return {
    id: majorEvent.id,
    name: majorEvent.name,
    emoji: majorEvent.emoji,
    startDate: majorEvent.startDate,
    endDate: majorEvent.endDate,
    description: majorEvent.description ?? undefined,
    subscriptionStartDate: majorEvent.subscriptionStartDate ?? undefined,
    subscriptionEndDate: majorEvent.subscriptionEndDate ?? undefined,
    maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee ?? undefined,
    maxLecturesPerAttendee: majorEvent.maxLecturesPerAttendee ?? undefined,
    buttonText: majorEvent.buttonText ?? undefined,
    buttonLink: majorEvent.buttonLink ?? undefined,
    contactInfo: majorEvent.contactInfo ?? undefined,
    contactType: majorEvent.contactType ?? undefined,
    isPaymentRequired: majorEvent.isPaymentRequired,
    additionalPaymentInfo: majorEvent.additionalPaymentInfo ?? undefined,
    shouldIssueCertificate: majorEvent.certificateConfigs.length > 0,
  };
}

@ObjectType()
export class PublicMajorEvent {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  buttonText?: string | null;

  @Field(() => String, { nullable: true })
  buttonLink?: string | null;

  @Field(() => String, { nullable: true })
  contactInfo?: string | null;

  @Field(() => ContactType, { nullable: true })
  contactType?: ContactType | null;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  maxCoursesPerAttendee?: number | null;

  @Field(() => Int, { nullable: true })
  maxLecturesPerAttendee?: number | null;

  @Field(() => Boolean, { nullable: true })
  isPaymentRequired?: boolean | null;

  @Field(() => String, { nullable: true })
  additionalPaymentInfo?: string | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;
}

@ObjectType()
export class PublicEventGroup {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForEachEvent?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssuePartialCertificate?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;
}

@ObjectType()
export class PublicEvent {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int, { nullable: true })
  creditMinutes?: number | null;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String)
  emoji!: string;

  @Field(() => EventType)
  type!: EventType;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  shortDescription?: string | null;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => PublicMajorEvent, { nullable: true })
  majorEvent?: PublicMajorEvent | null;

  @Field(() => String, { nullable: true })
  eventGroupId?: string | null;

  @Field(() => PublicEventGroup, { nullable: true })
  eventGroup?: PublicEventGroup | null;

  @Field(() => Boolean, { nullable: true })
  allowSubscription?: boolean | null;

  @Field(() => Date, { nullable: true })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  shouldCollectAttendance?: boolean | null;

  @Field(() => Boolean, { nullable: true })
  isOnlineAttendanceAllowed?: boolean | null;

  @Field(() => Date, { nullable: true })
  onlineAttendanceStartDate?: Date | null;

  @Field(() => Date, { nullable: true })
  onlineAttendanceEndDate?: Date | null;

  @Field(() => Boolean, { nullable: true })
  publiclyVisible?: boolean | null;

  @Field(() => String, { nullable: true })
  youtubeCode?: string | null;

  @Field(() => String, { nullable: true })
  buttonText?: string | null;

  @Field(() => String, { nullable: true })
  buttonLink?: string | null;
}

@ObjectType()
export class PublicEventSubscriptionSummary {
  @Field(() => String)
  eventId!: string;

  @Field(() => Int, { nullable: true })
  slots?: number | null;

  @Field(() => Int, { nullable: true })
  availableSlots?: number | null;

  @Field(() => Boolean)
  hasAvailableSlots!: boolean;
}
