import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

import { MergeCandidateStatus, MergeMatchMethod } from './enums';
import { EventAttendance } from './attendance';
import { EventLecturer } from './lecturers';
import { LecturerProfile } from './lecturer-profiles';
import { User } from './auth';

@ObjectType('Person')
export class Person {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => [String], { nullable: true })
  secondaryEmails?: string[] | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  identityDocument?: string | null;

  @Field(() => String, { nullable: true })
  academicId?: string | null;

  @Field(() => String, { nullable: true })
  userId?: string | null;

  @Field(() => User, { nullable: true })
  user?: User | null;

  @Field(() => [EventAttendance], { nullable: true })
  attendances?: EventAttendance[] | null;

  @Field(() => [EventLecturer], { nullable: true })
  lectures?: EventLecturer[] | null;

  @Field(() => LecturerProfile, { nullable: true })
  lecturerProfile?: LecturerProfile | null;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string | null;

  @Field(() => String, { nullable: true })
  externalRef?: string | null;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date | null;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string | null;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string | null;
}

@ObjectType()
export class PersonLinkedResource {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => String, { nullable: true })
  route?: string | null;

  @Field(() => String, { nullable: true })
  status?: string | null;

  @Field(() => Date, { nullable: true })
  occurredAt?: Date | null;
}

@ObjectType()
export class PersonLinkedResourceGroup {
  @Field(() => String)
  type!: string;

  @Field(() => String)
  label!: string;

  @Field(() => String)
  icon!: string;

  @Field(() => [PersonLinkedResource])
  items!: PersonLinkedResource[];

  @Field(() => Int)
  totalCount!: number;
}

@ObjectType()
export class PersonLinkedDataSummary {
  @Field(() => String)
  personId!: string;

  @Field(() => [PersonLinkedResourceGroup])
  groups!: PersonLinkedResourceGroup[];

  @Field(() => Int)
  totalCount!: number;

  @Field(() => Boolean)
  hasLinkedData!: boolean;

  @Field(() => Boolean)
  canDelete!: boolean;
}

@ObjectType()
export class MergeCandidate {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  personAId!: string;

  @Field(() => String)
  personBId!: string;

  @Field(() => Person, { nullable: true })
  personA?: Person;

  @Field(() => Person, { nullable: true })
  personB?: Person;

  @Field(() => String)
  pairKey!: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus)
  status!: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}
