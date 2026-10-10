import { AttendanceEligibility, EventAudience } from './enums';
import { Field, ObjectType } from '@nestjs/graphql';
import { EventAudienceInvitation } from './event-audience';

@ObjectType()
export class EventGroup {
  @Field(() => EventAudience)
  audience?: EventAudience;

  @Field(() => [String])
  audienceCourseCodes?: string[];

  @Field(() => [EventAudienceInvitation])
  audienceInvitations?: EventAudienceInvitation[];

  @Field(() => String, { nullable: true })
  majorEventId?: string | null;
  @Field(() => Boolean)
  interestEnabled = false;

  @Field(() => AttendanceEligibility, { nullable: true })
  attendanceEligibility?: AttendanceEligibility | null;

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
