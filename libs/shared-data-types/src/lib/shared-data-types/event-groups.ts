import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class EventGroup {
  @Field(() => Boolean)
  isSportsCategory?: boolean;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => Boolean)
  requiresImageLicenseAgreement!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificate!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonPayingAttendees!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForNonSubscribedAttendees!: boolean;

  @Field(() => Boolean)
  shouldIssueCertificateForEachEvent!: boolean;

  @Field(() => Boolean)
  shouldIssuePartialCertificate!: boolean;

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
