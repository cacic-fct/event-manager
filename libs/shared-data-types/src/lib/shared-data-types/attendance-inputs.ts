import { Field, InputType } from '@nestjs/graphql';

import { AttendanceCollectionLocationInput } from './attendance';
import { OfflineAttendanceCreationMethod } from './enums';

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
  code!: string;

  @Field(() => AttendanceCollectionLocationInput, { nullable: true })
  location?: AttendanceCollectionLocationInput;
}

@InputType()
export class EventAttendanceManualInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  value!: string;

  @Field(() => AttendanceCollectionLocationInput, { nullable: true })
  location?: AttendanceCollectionLocationInput;
}

@InputType()
export class OfflineEventAttendanceCommitInput {
  @Field(() => String)
  clientId!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => OfflineAttendanceCreationMethod)
  createdByMethod!: OfflineAttendanceCreationMethod;

  @Field(() => String, { nullable: true })
  code?: string;

  @Field(() => String, { nullable: true })
  value?: string;

  @Field(() => AttendanceCollectionLocationInput)
  location!: AttendanceCollectionLocationInput;

  @Field(() => Date)
  collectedAt!: Date;

  @Field(() => String, { nullable: true })
  authorUserId?: string;

  @Field(() => String, { nullable: true })
  authorName?: string;

  @Field(() => String, { nullable: true })
  authorEmail?: string;
}

@InputType()
export class CommitOfflineEventAttendancesInput {
  @Field(() => [OfflineEventAttendanceCommitInput])
  attendances!: OfflineEventAttendanceCommitInput[];
}

@InputType()
export class EventAttendanceCsvImportInput {
  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  csvContent!: string;

  @Field(() => String)
  selectedHeader!: string;
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
