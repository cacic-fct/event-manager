import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description:
    'Public weather forecast payload for event detail surfaces. Values are provider-derived and should be displayed with attribution.',
})
export class PublicEventWeather {
  @Field(() => String, {
    description: 'Public event whose schedule and location were used for the forecast.',
  })
  eventId!: string;

  @Field(() => Float, {
    description: 'Forecast temperature in Celsius.',
  })
  temperature!: number;

  @Field(() => Int, {
    description: 'Weather provider condition code used to derive the summary and icon.',
  })
  weatherCode!: number;

  @Field(() => String, {
    description: 'Short participant-facing forecast summary.',
  })
  summary!: string;

  @Field(() => String, {
    description: 'Material icon name that represents the forecast condition.',
  })
  materialIcon!: string;

  @Field(() => Date, {
    description: 'Forecast timestamp matched to the event schedule.',
  })
  forecastTime!: Date;

  @Field(() => Date, {
    description: 'Date and time when this forecast payload was fetched or refreshed.',
  })
  fetchedAt!: Date;

  @Field(() => String, {
    description: 'Required weather provider attribution text for public display.',
  })
  attribution!: string;
}
