import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class PersonCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[];

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}

@InputType()
export class PersonUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[];

  @Field(() => String, { nullable: true })
  phone?: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => String, { nullable: true })
  userId?: string;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}
