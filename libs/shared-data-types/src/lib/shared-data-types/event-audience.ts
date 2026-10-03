import { Field, ObjectType } from '@nestjs/graphql';
import { Person } from './people';

@ObjectType()
export class EventAudienceInvitation {
  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person!: Person | null;
}
