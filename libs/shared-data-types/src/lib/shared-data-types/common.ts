import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class DeletionResult {
  @Field(() => Boolean)
  deleted!: boolean;

  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;
}
