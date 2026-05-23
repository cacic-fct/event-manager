import { Field, ObjectType } from '@nestjs/graphql';

import { UserRole } from './enums';

@ObjectType()
export class AuthenticatedUser {
  @Field(() => String, { nullable: true })
  sub?: string;

  @Field(() => String, { nullable: true })
  preferredUsername?: string;

  @Field(() => String, { nullable: true })
  email?: string;

  @Field(() => String)
  token!: string;

  @Field(() => [String])
  roles!: string[];

  @Field(() => [String])
  permissions!: string[];

  @Field(() => [String])
  oidcScopes!: string[];

  @Field(() => [String], { deprecationReason: 'Use roles instead.' })
  scopes!: string[];
}

@ObjectType()
export class User {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  identityDocument?: string;

  @Field(() => String, { nullable: true })
  academicId?: string;

  @Field(() => UserRole)
  role!: UserRole;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}
