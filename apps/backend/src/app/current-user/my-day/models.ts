import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CurrentUserMyDayRole {
  @Field(() => String)
  kind!: string;

  @Field(() => String)
  label!: string;
}

@ObjectType()
export class CurrentUserMyDayAction {
  @Field(() => String)
  kind!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  materialIcon!: string;

  @Field(() => String)
  route!: string;

  @Field(() => Boolean)
  offlineCapable!: boolean;
}

@ObjectType()
export class CurrentUserMyDayEvent {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => [CurrentUserMyDayRole])
  roles!: CurrentUserMyDayRole[];

  @Field(() => CurrentUserMyDayAction, { nullable: true })
  attendanceAction?: CurrentUserMyDayAction | null;

  @Field(() => [CurrentUserMyDayAction])
  sportsActions!: CurrentUserMyDayAction[];

  @Field(() => CurrentUserMyDayAction)
  infoAction!: CurrentUserMyDayAction;

  @Field(() => CurrentUserMyDayAction, { nullable: true })
  mapAction?: CurrentUserMyDayAction | null;
}

@ObjectType()
export class CurrentUserMyDayAttentionItem {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  kind!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  description!: string;

  @Field(() => String)
  materialIcon!: string;

  @Field(() => String)
  route!: string;

  @Field(() => Int)
  priority!: number;

  @Field(() => Boolean)
  offlineCapable!: boolean;
}

@ObjectType()
export class CurrentUserMyDayWeatherAlert {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  kind!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String)
  advice!: string;

  @Field(() => String)
  materialIcon!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  eventName!: string;

  @Field(() => Date)
  forecastTime!: Date;

  @Field(() => Float)
  temperature!: number;

  @Field(() => Float, { nullable: true })
  uvIndex?: number | null;

  @Field(() => String)
  route!: string;
}

@ObjectType()
export class CurrentUserMyDay {
  @Field(() => Date)
  generatedAt!: Date;

  @Field(() => String)
  selectedDate!: string;

  @Field(() => String)
  minimumDate!: string;

  @Field(() => Boolean)
  hasContent!: boolean;

  @Field(() => CurrentUserMyDayEvent, { nullable: true })
  currentEvent?: CurrentUserMyDayEvent | null;

  @Field(() => CurrentUserMyDayEvent, { nullable: true })
  nextEvent?: CurrentUserMyDayEvent | null;

  @Field(() => [CurrentUserMyDayEvent])
  laterEvents!: CurrentUserMyDayEvent[];

  @Field(() => [CurrentUserMyDayAttentionItem])
  attention!: CurrentUserMyDayAttentionItem[];

  @Field(() => [CurrentUserMyDayWeatherAlert])
  weather!: CurrentUserMyDayWeatherAlert[];
}
