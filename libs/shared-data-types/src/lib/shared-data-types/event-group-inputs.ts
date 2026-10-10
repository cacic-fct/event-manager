import { AttendanceEligibility, EventAudience } from './enums';
import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class EventGroupCreateInput {
  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => EventAudience, { nullable: true })
  audience?: EventAudience;

  @Field(() => [String], { nullable: true })
  audienceCourseCodes?: string[];

  @Field(() => [String], { nullable: true })
  invitationPersonIds?: string[];

  @Field(() => Boolean, { nullable: true })
  interestEnabled?: boolean;

  @Field(() => AttendanceEligibility, { nullable: true })
  attendanceEligibility?: AttendanceEligibility | null;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  requiresImageLicenseAgreement?: boolean;

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
}

@InputType()
export class EventGroupUpdateInput {
  @Field(() => String, { nullable: true })
  majorEventId?: string | null;

  @Field(() => EventAudience, { nullable: true })
  audience?: EventAudience;

  @Field(() => [String], { nullable: true })
  audienceCourseCodes?: string[];

  @Field(() => [String], { nullable: true })
  invitationPersonIds?: string[];

  @Field(() => Boolean, { nullable: true })
  interestEnabled?: boolean;

  @Field(() => AttendanceEligibility, { nullable: true })
  attendanceEligibility?: AttendanceEligibility | null;

  @Field(() => String, { nullable: true })
  id?: string;

  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => String, { nullable: true })
  emoji?: string;

  @Field(() => Boolean, { nullable: true })
  requiresImageLicenseAgreement?: boolean;

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
}

@InputType()
export class EventGroupClonePartsInput {
  @Field(() => Boolean, { nullable: true })
  certificateConfig?: boolean;
}

@InputType()
export class EventGroupCloneInput {
  @Field(() => String, { nullable: true })
  name?: string;

  @Field(() => EventGroupClonePartsInput, { nullable: true })
  parts?: EventGroupClonePartsInput;
}
