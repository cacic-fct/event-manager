import { Field, InputType, ObjectType } from '@nestjs/graphql';

@ObjectType('EventMaterial')
export class EventMaterialModel {
  @Field(() => String) title!: string;
  @Field(() => String) url!: string;
  @Field(() => Boolean, { nullable: true }) releaseAfterEvent?: boolean;
}

@InputType()
export class EventMaterialInput {
  @Field(() => String) title!: string;
  @Field(() => String) url!: string;
  @Field(() => Boolean, { nullable: true }) releaseAfterEvent?: boolean;
}

@ObjectType()
export class EventMaterials {
  @Field(() => [EventMaterialModel]) links!: EventMaterialModel[];
  @Field(() => Date, { nullable: true }) updatedAt!: Date | null;
  @Field(() => Date, { nullable: true }) nextReleaseAt?: Date | null;
}

@ObjectType()
export class EventPreparation {
  @Field(() => String, { nullable: true }) lecturerInformation!: string | null;
  @Field(() => String, { nullable: true }) collectorInformation!: string | null;
  @Field(() => Date, { nullable: true }) updatedAt!: Date | null;
}
