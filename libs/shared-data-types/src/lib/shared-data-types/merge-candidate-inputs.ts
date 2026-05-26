import { Field, Float, InputType } from '@nestjs/graphql';

import { MergeCandidateStatus, MergeMatchMethod, PersonMergeField } from './enums';

@InputType()
export class MergeCandidateCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  personAId!: string;

  @Field(() => String)
  personBId!: string;

  @Field(() => String)
  pairKey!: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus, { nullable: true })
  status?: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;
}

@InputType()
export class MergeCandidateUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  personAId?: string;

  @Field(() => String, { nullable: true })
  personBId?: string;

  @Field(() => String, { nullable: true })
  pairKey?: string;

  @Field(() => Float, { nullable: true })
  score?: number;

  @Field(() => MergeMatchMethod, { nullable: true })
  matchMethod?: MergeMatchMethod;

  @Field(() => String, { nullable: true })
  matchValue?: string;

  @Field(() => MergeCandidateStatus, { nullable: true })
  status?: MergeCandidateStatus;

  @Field(() => String, { nullable: true })
  resolvedById?: string;
}

@InputType()
export class MergeCandidateMergeInput {
  @Field(() => String)
  candidateId!: string;

  @Field(() => String)
  targetPersonId!: string;

  @Field(() => [PersonMergeField], { nullable: true })
  migrateFields?: PersonMergeField[];
}
