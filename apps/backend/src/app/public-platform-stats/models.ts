import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description:
    'Cached all-time aggregate counts for CACiC Eventos. Counts include non-public records but exclude soft-deleted rows.',
})
export class PublicPlatformStats {
  @Field(() => Int)
  peopleCount!: number;

  @Field(() => Int)
  eventsCount!: number;

  @Field(() => Int)
  majorEventsCount!: number;

  @Field(() => Int)
  certificatesCount!: number;
}
