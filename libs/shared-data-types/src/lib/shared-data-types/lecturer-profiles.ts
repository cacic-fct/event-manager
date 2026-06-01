import { Field, ObjectType } from '@nestjs/graphql';

import { Person } from './people';

@ObjectType()
export class LecturerProfile {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => Person, { nullable: true })
  person?: Person;

  @Field(() => String)
  displayName!: string;

  @Field(() => String)
  biography!: string;

  @Field(() => Boolean)
  publishGoogleUserPicture!: boolean;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  whatsapp?: string | null;

  @Field(() => String, { nullable: true })
  googleUserPicture?: string | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;
}
