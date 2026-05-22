import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class EventLecturerCreateInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}

@InputType()
export class EventLecturerUpdateInput {
  @Field(() => String, { nullable: true })
  eventId?: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;
}
