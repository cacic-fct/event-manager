import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PublicEventWeather {
  @Field(() => String)
  eventId!: string;

  @Field(() => Float)
  temperature!: number;

  @Field(() => Int)
  weatherCode!: number;

  @Field(() => String)
  summary!: string;

  @Field(() => String)
  materialIcon!: string;

  @Field(() => Date)
  forecastTime!: Date;

  @Field(() => Date)
  fetchedAt!: Date;

  @Field(() => String)
  attribution!: string;
}
