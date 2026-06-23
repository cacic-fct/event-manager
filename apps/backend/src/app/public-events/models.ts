import { ContactType, EventType } from '@cacic-fct/shared-data-types';
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
  maxUncategorizedPerAttendee: true,
  rankedSubscriptionEnabled: true,
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
  majorEventPrices: {
    select: {
      id: true,
      type: true,
      tiers: {
        select: {
          id: true,
          name: true,
          value: true,
        },
      },
    },
  },
} as const satisfies Prisma.MajorEventSelect;

export const PUBLIC_EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificate: true,
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
  slotsAvailable: true,
  queueCount: true,
  autoSubscribe: true,
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

export type PublicEventRecord = Prisma.EventGetPayload<{
  select: typeof PUBLIC_EVENT_SELECT;
}>;

export type PublicPaymentInfoRecord = Prisma.PaymentInfoGetPayload<{
  select: {
    id: true;
    bankName: true;
    agency: true;
    account: true;
    holder: true;
    document: true;
    pixKey: true;
    pixCity: true;
    majorEventId: true;
  };
}>;

export function mapPublicMajorEvent(majorEvent: PublicMajorEventRecord): PublicMajorEvent {
  const paymentInfo =
    'paymentInfo' in majorEvent && majorEvent.paymentInfo
      ? mapPublicPaymentInfo(majorEvent.paymentInfo as PublicPaymentInfoRecord)
      : undefined;

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
    maxUncategorizedPerAttendee: majorEvent.maxUncategorizedPerAttendee ?? undefined,
    rankedSubscriptionEnabled: majorEvent.rankedSubscriptionEnabled,
    buttonText: majorEvent.buttonText ?? undefined,
    buttonLink: majorEvent.buttonLink ?? undefined,
    contactInfo: majorEvent.contactInfo ?? undefined,
    contactType: majorEvent.contactType ?? undefined,
    isPaymentRequired: majorEvent.isPaymentRequired,
    additionalPaymentInfo: majorEvent.additionalPaymentInfo ?? undefined,
    shouldIssueCertificate: majorEvent.certificateConfigs.length > 0,
    paymentInfo,
    majorEventPrices: majorEvent.majorEventPrices.map((price) => ({
      id: price.id,
      type: price.type,
      tiers: price.tiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        value: tier.value,
      })),
    })),
  };
}

export function mapPublicPaymentInfo(paymentInfo: PublicPaymentInfoRecord): PublicPaymentInfo {
  return {
    id: paymentInfo.id,
    bankName: paymentInfo.bankName,
    agency: paymentInfo.agency,
    account: paymentInfo.account,
    holder: paymentInfo.holder,
    document: paymentInfo.document,
    pixKey: paymentInfo.pixKey ?? undefined,
    pixCity: paymentInfo.pixCity ?? undefined,
    majorEventId: paymentInfo.majorEventId,
  };
}

@ObjectType({
  description: 'Payment instructions shown to participants when a major event requires manual payment confirmation.',
})
export class PublicPaymentInfo {
  @Field(() => String, {
    description: 'Payment instruction record associated with the major event payment flow.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Bank name displayed to participants when bank-transfer details are used.',
  })
  bankName!: string;

  @Field(() => String, {
    description: 'Bank branch ("agency") information displayed as part of manual payment instructions.',
  })
  agency!: string;

  @Field(() => String, {
    description: 'Bank account information displayed as part of manual payment instructions.',
  })
  account!: string;

  @Field(() => String, {
    description: 'Account holder name participants should use to verify payment destination.',
  })
  holder!: string;

  @Field(() => String, {
    description: 'Document associated with the payment receiver, shown for participant-side payment verification.',
  })
  document!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Pix key when the major event accepts Pix-based manual payment.',
  })
  pixKey?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Pix city metadata used to generate BRCode',
  })
  pixCity?: string | null;

  @Field(() => String, {
    description: 'Major event that owns these payment instructions.',
  })
  majorEventId!: string;
}

@ObjectType({
  description: 'Concrete price option inside a public major-event payment tier group.',
})
export class PublicMajorEventPriceTier {
  @Field(() => String, {
    description: 'Tier identifier used when the frontend needs to reference a selected payment option.',
  })
  id!: string;

  @Field(() => String, {
    description:
      'Participant-facing label for this price tier, such as student, external participant, or other configured category.',
  })
  name!: string;

  @Field(() => Int, {
    description: 'Tier value in the smallest currency unit used by the application.',
  })
  value!: number;
}

@ObjectType({
  description:
    'Payment price group exposed for a public major event. A major event may expose multiple configured price tiers.',
})
export class PublicMajorEventPrice {
  @Field(() => String, {
    description: 'Price group identifier used by the payment/subscription flow.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Price group type used by the frontend to distinguish configured payment strategies.',
  })
  type!: string;

  @Field(() => [PublicMajorEventPriceTier], {
    description: 'Participant-selectable tiers configured inside this price group.',
  })
  tiers!: PublicMajorEventPriceTier[];
}

@ObjectType({
  description:
    'Public major-event data needed to render the event landing/subscription flow without exposing administrative fields.',
})
export class PublicMajorEvent {
  @Field(() => String, {
    description:
      'Major event identifier used to scope public event lists, subscriptions, payment, and certificate validation flows.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Participant-facing major event title used across public pages and subscription screens.',
  })
  name!: string;

  @Field(() => String, {
    description: 'Visual marker used by the Angular UI when rendering event cards and headings.',
  })
  emoji!: string;

  @Field(() => Date, {
    description: 'Start of the major event period. Individual events may have their own narrower schedules.',
  })
  startDate!: Date;

  @Field(() => Date, {
    description: 'End of the major event period. Individual events may have their own narrower schedules.',
  })
  endDate!: Date;

  @Field(() => String, {
    nullable: true,
    description: 'Public long-form description used on the major event page.',
  })
  description?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional call-to-action label configured for the public major event page.',
  })
  buttonText?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional call-to-action target configured for the public major event page.',
  })
  buttonLink?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Public support/contact value shown to participants when configured.',
  })
  contactInfo?: string | null;

  @Field(() => ContactType, {
    nullable: true,
    description: 'How the frontend should interpret the configured contact information.',
  })
  contactType?: ContactType | null;

  @Field(() => Date, {
    nullable: true,
    description:
      'Opening date for major-event subscription. Null means the backend did not expose a configured opening boundary.',
  })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description:
      'Closing date for major-event subscription. Null means the backend did not expose a configured closing boundary.',
  })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Maximum number of course-type events a participant may select in ranked or constrained subscription flows.',
  })
  maxCoursesPerAttendee?: number | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Maximum number of lecture-type events a participant may select in ranked or constrained subscription flows.',
  })
  maxLecturesPerAttendee?: number | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Maximum number of uncategorized events a participant may select in ranked or constrained subscription flows.',
  })
  maxUncategorizedPerAttendee?: number | null;

  @Field(() => Boolean, {
    description:
      'Whether participants choose and rank preferred events instead of only submitting direct subscriptions.',
  })
  rankedSubscriptionEnabled!: boolean;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether confirmed participation in this major event depends on a payment workflow.',
  })
  isPaymentRequired?: boolean | null;

  @Field(() => String, {
    nullable: true,
    description: 'Public payment notes shown alongside structured payment information.',
  })
  additionalPaymentInfo?: string | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether this major event has an active certificate configuration visible to public flows.',
  })
  shouldIssueCertificate?: boolean | null;

  @Field(() => PublicPaymentInfo, {
    nullable: true,
    description: 'Manual payment instructions exposed only when the major event has configured payment details.',
  })
  paymentInfo?: PublicPaymentInfo | null;

  @Field(() => [PublicMajorEventPrice], {
    description: 'Configured public price groups and tiers used by the subscription/payment flow.',
  })
  majorEventPrices!: PublicMajorEventPrice[];
}

@ObjectType({
  description: 'Public event group metadata used to explain grouped activities and group-level certificate behavior.',
})
export class PublicEventGroup {
  @Field(() => String, {
    description: 'Event group identifier used to relate public events that share selection or certificate rules.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Participant-facing group title used in public event lists.',
  })
  name!: string;

  @Field(() => String, {
    description: 'Visual marker used by the Angular UI when rendering grouped event sections.',
  })
  emoji!: string;

  @Field(() => Boolean, {
    nullable: true,
    description: 'When true, certificates may be emitted per event instead of only as one grouped certificate.',
  })
  shouldIssueCertificateForEachEvent?: boolean | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether partial participation in the group can still generate certificate output.',
  })
  shouldIssuePartialCertificate?: boolean | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether this event group participates in certificate issuance at all.',
  })
  shouldIssueCertificate?: boolean | null;
}

@ObjectType({
  description:
    'Public lecturer details attached to an event. Profile fields are included when the lecturer has a public profile.',
})
export class PublicLecturerProfile {
  @Field(() => String, {
    description: 'Public lecturer identifier. Uses the profile identifier when available, otherwise the person identifier.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Public display name shown on event pages.',
  })
  displayName!: string;

  @Field(() => String, {
    nullable: true,
    description: 'Public biography shown on event pages.',
  })
  biography?: string | null;

  @Field(() => Boolean, {
    description: 'Whether the lecturer opted into publishing the Google account picture.',
  })
  publishGoogleUserPicture!: boolean;

  @Field(() => String, {
    nullable: true,
    description: 'Published Google account picture URL, when opted in and available.',
  })
  googleUserPicture?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional public contact e-mail.',
  })
  email?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional public WhatsApp number in E.164 format.',
  })
  whatsapp?: string | null;
}

@ObjectType({
  description:
    'Public event data used by the Angular event catalog, subscription flow, attendance prompts, and certificate-related UI.',
})
export class PublicEvent {
  @Field(() => String, {
    description: 'Event identifier used by subscriptions, attendance, realtime availability, and event detail routes.',
  })
  id!: string;

  @Field(() => String, {
    description: 'Participant-facing event title used in public catalog and subscription views.',
  })
  name!: string;

  @Field(() => Int, {
    nullable: true,
    description:
      'Certificate workload for this event expressed in minutes. Null means the event does not expose credit workload through this public model.',
  })
  creditMinutes?: number | null;

  @Field(() => Date, {
    description: 'Event start date used for schedule rendering and conflict checks.',
  })
  startDate!: Date;

  @Field(() => Date, {
    description: 'Event end date used for schedule rendering and conflict checks.',
  })
  endDate!: Date;

  @Field(() => String, {
    description: 'Visual marker used by the Angular UI when rendering event cards and lists.',
  })
  emoji!: string;

  @Field(() => EventType, {
    description: 'Public event category used by subscription limits, filtering, and display grouping.',
  })
  type!: EventType;

  @Field(() => String, {
    nullable: true,
    description: 'Public long-form event description for detail pages.',
  })
  description?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Compact description used in cards or dense lists where the full description would be too large.',
  })
  shortDescription?: string | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Latitude used by the UI when map/location display is available.',
  })
  latitude?: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Longitude used by the UI when map/location display is available.',
  })
  longitude?: number | null;

  @Field(() => String, {
    nullable: true,
    description: 'Human-readable location text.',
  })
  locationDescription?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Major event that contains this event. Null means the event is standalone in the public catalog.',
  })
  majorEventId?: string | null;

  @Field(() => PublicMajorEvent, {
    nullable: true,
    description: 'Public major-event context included when this event is part of a major event.',
  })
  majorEvent?: PublicMajorEvent | null;

  @Field(() => String, {
    nullable: true,
    description: 'Event group that contains this event. Null means the event is not grouped in the public catalog.',
  })
  eventGroupId?: string | null;

  @Field(() => PublicEventGroup, {
    nullable: true,
    description: 'Public group context included when this event belongs to a grouped activity set.',
  })
  eventGroup?: PublicEventGroup | null;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Whether participants may subscribe directly to this event instead of only viewing it as informational content.',
  })
  allowSubscription?: boolean | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Opening date for direct event subscription. Major-event flows may impose additional constraints.',
  })
  subscriptionStartDate?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description: 'Closing date for direct event subscription. Major-event flows may impose additional constraints.',
  })
  subscriptionEndDate?: Date | null;

  @Field(() => Int, {
    nullable: true,
    description:
      'Configured attendance capacity. Null means the public API does not expose a fixed capacity for this event.',
  })
  slots?: number | null;

  /**
   * Intentionally not exposed through GraphQL in the current schema.
   */
  slotsAvailable?: number | null;

  /**
   * Intentionally not exposed through GraphQL in the current schema.
   */
  queueCount!: number;

  @Field(() => Boolean, {
    nullable: true,
    description:
      'Whether eligible participants should be subscribed automatically by the backend instead of making an explicit selection.',
  })
  autoSubscribe?: boolean | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether this event participates in certificate issuance independently of group or major-event rules.',
  })
  shouldIssueCertificate?: boolean | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether the event supports attendance collection by organizers or authorized collectors.',
  })
  shouldCollectAttendance?: boolean | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether eligible users can confirm attendance online without an in-person scan.',
  })
  isOnlineAttendanceAllowed?: boolean | null;

  @Field(() => Date, {
    nullable: true,
    description:
      'Opening boundary for online attendance confirmation. Null means no explicit opening boundary is exposed.',
  })
  onlineAttendanceStartDate?: Date | null;

  @Field(() => Date, {
    nullable: true,
    description:
      'Closing boundary for online attendance confirmation. Null means no explicit closing boundary is exposed.',
  })
  onlineAttendanceEndDate?: Date | null;

  @Field(() => Boolean, {
    nullable: true,
    description: 'Whether this event is currently intended to appear in public event surfaces.',
  })
  publiclyVisible?: boolean | null;

  @Field(() => String, {
    nullable: true,
    description: 'YouTube video identifier used when the event exposes public video content.',
  })
  youtubeCode?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional call-to-action label configured for the public event page.',
  })
  buttonText?: string | null;

  @Field(() => String, {
    nullable: true,
    description: 'Optional call-to-action target configured for the public event page.',
  })
  buttonLink?: string | null;

  @Field(() => [PublicLecturerProfile], {
    description: 'Public lecturers associated with this event.',
  })
  lecturers?: PublicLecturerProfile[];
}

@ObjectType({
  description: 'Compact subscription availability snapshot used by public pages and SSE updates.',
})
export class PublicEventSubscriptionSummary {
  @Field(() => String, {
    description: 'Event whose subscription availability is summarized.',
  })
  eventId!: string;

  @Field(() => Boolean, {
    description: 'Whether the event currently has available slots according to the public subscription calculation.',
  })
  hasAvailableSlots!: boolean;
}

@ObjectType({
  description:
    'Public page model for a major event subscription screen, including the major event, visible child events, and availability snapshots.',
})
export class PublicMajorEventSubscriptionPage {
  @Field(() => PublicMajorEvent, {
    description: 'Major-event context used by the subscription page header, payment section, and selection rules.',
  })
  majorEvent!: PublicMajorEvent;

  @Field(() => [PublicEvent], {
    description: 'Public events available for rendering in the major-event subscription page.',
  })
  events!: PublicEvent[];

  @Field(() => [PublicEventSubscriptionSummary], {
    description:
      'Availability snapshots separated from event records so the frontend can refresh subscription controls without replacing the whole page model.',
  })
  subscriptionSummaries!: PublicEventSubscriptionSummary[];
}
