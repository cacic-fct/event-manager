import { Field, ObjectType } from '@nestjs/graphql';
import { Person } from './people';
import type { Relation } from './relation';

@ObjectType()
export class EventAudienceInvitation {
  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person!: Relation<Person> | null;
}
