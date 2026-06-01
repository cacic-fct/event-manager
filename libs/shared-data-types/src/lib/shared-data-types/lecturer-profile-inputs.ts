import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class LecturerProfileUpsertInput {
  @Field(() => String)
  displayName!: string;

  @Field(() => String)
  biography!: string;

  @Field(() => Boolean, { nullable: true })
  publishGoogleUserPicture?: boolean;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  whatsapp?: string | null;
}
