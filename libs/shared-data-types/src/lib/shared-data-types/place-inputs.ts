import { Field, Float, InputType } from '@nestjs/graphql';

@InputType()
export class PlacePresetCreateInput {
  @Field(() => String)
  name!: string;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;
}

@InputType()
export class PlacePresetUpdateInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;
}
