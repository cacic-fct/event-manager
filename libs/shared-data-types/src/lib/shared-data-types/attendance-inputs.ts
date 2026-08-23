import { Field, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, MaxLength } from 'class-validator';

import { AttendanceCollectionLocationInput } from './attendance';
import { EventAttendanceStatus, OfflineAttendanceCreationMethod } from './enums';

@InputType()
export class EventAttendanceCreateInput {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => Date, { nullable: true })
  attendedAt?: Date;
}

@InputType()
export class EventAttendanceScannerCodeInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  @MaxLength(2_048)
  code!: string;

  @Field(() => AttendanceCollectionLocationInput, { nullable: true })
  location?: AttendanceCollectionLocationInput;
}

@InputType()
export class EventAttendanceManualInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  @MaxLength(500)
  value!: string;

  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => AttendanceCollectionLocationInput, { nullable: true })
  location?: AttendanceCollectionLocationInput;
}

@InputType()
export class EventOralAttendanceInput {
  @Field(() => String, { nullable: true })
  @MaxLength(200)
  clientId?: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => EventAttendanceStatus)
  status!: EventAttendanceStatus;

  @Field(() => Date)
  collectedAt!: Date;

  @Field(() => String)
  @MaxLength(200)
  collectedByUserId!: string;

  @Field(() => AttendanceCollectionLocationInput, { nullable: true })
  location?: AttendanceCollectionLocationInput;

  @Field(() => String, { nullable: true })
  @MaxLength(2048)
  collectorCredential?: string;
}

/** Administrative oral attendance keeps collector provenance but does not collect device location. */
@InputType()
export class AdminEventOralAttendanceInput {
  @Field(() => String, { nullable: true })
  @MaxLength(200)
  clientId?: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;

  @Field(() => EventAttendanceStatus)
  status!: EventAttendanceStatus;

  @Field(() => Date)
  collectedAt!: Date;

  @Field(() => String, { nullable: true })
  @MaxLength(200)
  collectedByUserId?: string;

  @Field(() => String, { nullable: true })
  @MaxLength(2048)
  collectorCredential?: string;
}

@InputType()
export class OfflineEventAttendanceCommitInput {
  @Field(() => String)
  @MaxLength(200)
  clientId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => OfflineAttendanceCreationMethod)
  createdByMethod!: OfflineAttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  @MaxLength(2_048)
  code?: string;

  @Field(() => String, { nullable: true })
  @MaxLength(500)
  value?: string;

  @Field(() => AttendanceCollectionLocationInput)
  location!: AttendanceCollectionLocationInput;

  @Field(() => Date)
  collectedAt!: Date;

  @Field(() => String)
  @MaxLength(200)
  authorUserId!: string;

  @Field(() => String, { nullable: true })
  @MaxLength(200)
  authorName?: string;

  @Field(() => String, { nullable: true })
  @MaxLength(320)
  authorEmail?: string;

  @Field(() => String, { nullable: true })
  @MaxLength(2048)
  collectorCredential?: string;
}

@InputType()
export class CommitOfflineEventAttendancesInput {
  @Field(() => [OfflineEventAttendanceCommitInput])
  @ArrayMaxSize(150)
  attendances!: OfflineEventAttendanceCommitInput[];
}

@InputType()
export class OfflineEventAttendanceSubmissionUpdateInput {
  @Field(() => OfflineAttendanceCreationMethod, { nullable: true })
  createdByMethod?: OfflineAttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  scannerCode?: string;

  @Field(() => String, { nullable: true })
  manualValue?: string;

  @Field(() => String, { nullable: true })
  personId?: string;
}

@InputType()
export class EventAttendanceCsvImportResolutionInput {
  @Field(() => String)
  value!: string;

  @Field(() => String)
  personId!: string;
}

@InputType()
export class EventAttendanceCsvImportInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  @MaxLength(5_000_000)
  csvContent!: string;

  @Field(() => String)
  @MaxLength(200)
  selectedHeader!: string;

  @Field(() => [EventAttendanceCsvImportResolutionInput], { nullable: true })
  @ArrayMaxSize(1_000)
  resolutions?: EventAttendanceCsvImportResolutionInput[];
}

@InputType()
export class EventAttendanceUpdateInput {
  @Field(() => Date, { nullable: true })
  attendedAt?: Date;
}

@InputType()
export class EventAttendanceCollectorCreateInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  personId!: string;
}
