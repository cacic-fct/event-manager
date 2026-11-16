import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { EventMaterialModel } from '../events/event-preparation.models';

export enum ContentReviewDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

registerEnumType(ContentReviewDecision, { name: 'ContentReviewDecision' });

@ObjectType()
export class ContentReviewComparison {
  @Field(() => String) key!: string;
  @Field(() => String, { nullable: true }) before?: string | null;
  @Field(() => String, { nullable: true }) after?: string | null;
}

@ObjectType()
export class ContentReviewItem {
  @Field(() => String) key!: string;
  @Field(() => String) authorName!: string;
  @Field(() => [ContentReviewComparison]) fields!: ContentReviewComparison[];
  @Field(() => EventMaterialModel, { nullable: true }) beforeMaterial?: EventMaterialModel | null;
  @Field(() => EventMaterialModel, { nullable: true }) afterMaterial?: EventMaterialModel | null;
}

@ObjectType()
export class ContentReviewGroup {
  @Field(() => String) id!: string;
  @Field(() => Int) revision!: number;
  @Field(() => Date) updatedAt!: Date;
  @Field(() => String) targetName!: string;
  @Field(() => Boolean) isProfile!: boolean;
  @Field(() => [ContentReviewItem]) items!: ContentReviewItem[];
}

@ObjectType()
export class ContentReviewPage {
  @Field(() => [ContentReviewGroup]) groups!: ContentReviewGroup[];
  @Field(() => Boolean) hasNextPage!: boolean;
}
