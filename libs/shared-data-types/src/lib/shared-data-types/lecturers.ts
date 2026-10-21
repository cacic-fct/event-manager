import { Field, ObjectType } from '@nestjs/graphql';

import { Event } from './events';
import { Person } from './people';
import type { Relation } from './relation';

@ObjectType()
export class EventLecturer {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Event, { nullable: true })
  event?: Relation<Event>;

  @Field(() => Person, { nullable: true })
  person?: Relation<Person>;

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
  event?: Relation<Event>;

  @Field(() => Person, { nullable: true })
  person?: Relation<Person>;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}
