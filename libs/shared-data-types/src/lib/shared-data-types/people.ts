import { Field, Float, ObjectType } from '@nestjs/graphql';

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

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => [EventAttendance], { nullable: true })
  attendances?: EventAttendance[];

  @Field(() => [EventLecturer], { nullable: true })
  lectures?: EventLecturer[];

  @Field(() => LecturerProfile, { nullable: true })
  lecturerProfile?: LecturerProfile | null;

  @Field(() => String, { nullable: true })
  mergedIntoId?: string;

  @Field(() => String, { nullable: true })
  externalRef?: string;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => Date)
  updatedAt!: Date;

  @Field(() => String, { nullable: true })
  updatedById?: string;
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
