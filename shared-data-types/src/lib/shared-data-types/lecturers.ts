import { Field, ObjectType } from '@nestjs/graphql';

import { Event } from './events';
import { Person } from './people';

@ObjectType()
export class EventLecturer {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@ObjectType()
export class EventAttendanceCollector {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Event, { nullable: true })
  event?: Event;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}
