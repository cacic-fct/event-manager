import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class EventGroupCreateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForEachEvent?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssuePartialCertificate?: boolean;

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
export class EventGroupUpdateInput {
  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificate?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonPayingAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForNonSubscribedAttendees?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssueCertificateForEachEvent?: boolean;

  @Field(() => Boolean, { nullable: true })
  shouldIssuePartialCertificate?: boolean;

  @Field(() => Date, { nullable: true })
  deletedAt?: Date;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  @Field(() => String, { nullable: true })
  createdById?: string;

  @Field(() => String, { nullable: true })
  updatedById?: string;
}
