import { Field, GraphQLISODateTime, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description: 'A public event URL and its last modification timestamp for sitemap generation.',
})
export class PublicEventSitemapEntry {
  @Field(() => String)
  id!: string;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType({
  description: 'One stable, sitemap-size-limited page of public event URLs.',
})
export class PublicEventSitemapPage {
  @Field(() => [PublicEventSitemapEntry])
  entries!: PublicEventSitemapEntry[];

  @Field(() => Int, {
    description: 'Number of URL sitemaps needed to cover every public event.',
  })
  pageCount!: number;
}
