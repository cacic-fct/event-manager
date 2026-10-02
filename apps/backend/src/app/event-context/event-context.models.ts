import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

export const AdminEventContextKind = {
  EVENT: 'EVENT',
  EVENT_GROUP: 'EVENT_GROUP',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;
export type AdminEventContextKind = (typeof AdminEventContextKind)[keyof typeof AdminEventContextKind];

registerEnumType(AdminEventContextKind, { name: 'AdminEventContextKind' });

@ObjectType()
export class AdminEventContextAncestor {
  @Field(() => AdminEventContextKind)
  kind!: AdminEventContextKind;

  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  emoji!: string;
}

@ObjectType()
export class AdminEventContextNode {
  @Field(() => AdminEventContextKind)
  kind!: AdminEventContextKind;

  @Field()
  id!: string;

  @Field()
  name!: string;

  @Field()
  emoji!: string;

  @Field(() => Date, { nullable: true })
  startDate!: Date | null;

  @Field(() => Date, { nullable: true })
  endDate!: Date | null;

  @Field(() => String, { nullable: true })
  eventType!: string | null;

  @Field(() => String, { nullable: true })
  locationDescription!: string | null;

  @Field(() => String, { nullable: true })
  publicationState!: string | null;

  @Field(() => [AdminEventContextAncestor])
  ancestors!: AdminEventContextAncestor[];

  @Field()
  hasChildren!: boolean;
}

@ObjectType()
export class AdminEventContextPage {
  @Field(() => [AdminEventContextNode])
  nodes!: AdminEventContextNode[];

  @Field(() => String, { nullable: true })
  nextCursor!: string | null;

  @Field(() => Int)
  take!: number;
}
