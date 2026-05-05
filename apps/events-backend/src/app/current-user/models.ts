import {
  AuthenticatedUser as AuthenticatedUserObject,
  Person,
  User,
} from '@cacic-eventos/shared-data-types';
import { Field, InputType, Int, ObjectType } from '@nestjs/graphql';
import {
  PublicEvent,
  PublicEventGroup,
  PublicMajorEvent,
} from '../public-events/models';

@ObjectType()
export class CurrentUserProfileContext {
  @Field(() => String, { nullable: true })
  sub?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String, { nullable: true })
  preferredUsername?: string;

  @Field(() => AuthenticatedUserObject)
  authenticatedUser!: AuthenticatedUserObject;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => Person, { nullable: true })
  person?: Person;
}

@ObjectType()
export class CurrentUserEventAttendance {
  @Field(() => String)
  eventId!: string;

  @Field(() => PublicEvent)
  event!: PublicEvent;

  @Field(() => Date)
  attendedAt!: Date;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class CurrentUserEventSubscription {
  @Field(() => String)
  eventId!: string;

  @Field(() => PublicEvent)
  event!: PublicEvent;

  @Field(() => String, { nullable: true })
  eventGroupSubscriptionId?: string;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class CurrentUserEventGroupSubscription {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventGroupId!: string;

  @Field(() => PublicEventGroup)
  eventGroup!: PublicEventGroup;

  @Field(() => [PublicEvent])
  events!: PublicEvent[];

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class CurrentUserSubscriptionFeedSingleEvent {
  @Field(() => String)
  type = 'SINGLE_EVENT' as const;

  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => PublicEvent)
  event!: PublicEvent;

  @Field(() => Date, {
    description: 'Event start date used to sort the subscription feed.',
  })
  date!: Date;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class CurrentUserSubscriptionFeedEventGroup {
  @Field(() => String)
  type = 'EVENT_GROUP' as const;

  @Field(() => String)
  subscriptionId!: string;

  @Field(() => String)
  eventGroupId!: string;

  @Field(() => PublicEventGroup)
  eventGroup!: PublicEventGroup;

  @Field(() => Date, {
    description:
      'Earliest subscribed event start date used to sort the subscription feed.',
  })
  date!: Date;

  @Field(() => Date)
  createdAt!: Date;
}

@ObjectType()
export class CurrentUserEventParticipation {
  @Field(() => Boolean)
  isSubscribed!: boolean;

  @Field(() => Boolean)
  isLecturer!: boolean;

  @Field(() => Boolean)
  hasIssuedCertificate!: boolean;
}

@ObjectType()
export class CurrentUserSubscriptionFeed {
  @Field(() => [CurrentUserSubscriptionFeedItem])
  items!: CurrentUserSubscriptionFeedItem[];
}

@ObjectType()
export class CurrentUserSubscriptionFeedItem {
  @Field(() => String)
  type!: 'SINGLE_EVENT' | 'EVENT_GROUP';

  @Field(() => String, { nullable: true })
  subscriptionId?: string;

  @Field(() => Date, {
    description: 'Date used to sort the subscription feed.',
  })
  date!: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => PublicEvent, { nullable: true })
  event?: PublicEvent;

  @Field(() => String, { nullable: true })
  eventGroupId?: string;

  @Field(() => PublicEventGroup, { nullable: true })
  eventGroup?: PublicEventGroup;

  @Field(() => CurrentUserEventParticipation)
  participation!: CurrentUserEventParticipation;
}

@ObjectType()
export class SubscribedSingleEventItem {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  type = 'single' as const;

  @Field(() => PublicEvent)
  event!: PublicEvent;

  @Field(() => Date)
  startDate!: Date;
}

@ObjectType()
export class SubscribedEventGroupItem {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  type = 'group' as const;

  @Field(() => PublicEventGroup)
  eventGroup!: PublicEventGroup;

  @Field(() => [PublicEvent])
  events!: PublicEvent[];

  @Field(() => Date, {
    description: 'Earliest start date of events in the group',
  })
  startDate!: Date;
}

@ObjectType()
export class CurrentUserMajorEventSubscription {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => PublicMajorEvent)
  majorEvent!: PublicMajorEvent;

  @Field(() => String)
  subscriptionStatus!: string;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => [PublicEvent])
  selectedEvents!: PublicEvent[];

  @Field(() => [PublicEvent])
  notSubscribedEvents!: PublicEvent[];
}

@ObjectType()
export class CurrentUserMajorEventFeedItem {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => PublicMajorEvent)
  majorEvent!: PublicMajorEvent;

  @Field(() => String, { nullable: true })
  subscriptionStatus?: string;

  @Field(() => Int, { nullable: true })
  amountPaid?: number;

  @Field(() => Date, { nullable: true })
  paymentDate?: Date;

  @Field(() => String, { nullable: true })
  paymentTier?: string;

  @Field(() => [PublicEvent])
  selectedEvents!: PublicEvent[];

  @Field(() => [PublicEvent])
  notSubscribedEvents!: PublicEvent[];

  @Field(() => CurrentUserEventParticipation)
  participation!: CurrentUserEventParticipation;
}

@InputType()
export class UpsertCurrentUserMajorEventSubscriptionInput {
  @Field(() => String)
  majorEventId!: string;

  @Field(() => [String])
  selectedEventIds!: string[];

  @Field(() => Int, { nullable: true })
  amountPaid?: number | null;

  @Field(() => String, { nullable: true })
  paymentTier?: string | null;
}

@InputType()
export class ConfirmCurrentUserOnlineAttendanceInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  code!: string;
}
