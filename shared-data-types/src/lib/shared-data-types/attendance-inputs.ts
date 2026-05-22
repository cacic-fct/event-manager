import { Field, InputType } from '@nestjs/graphql';

import { AttendanceCollectionLocationInput } from './attendance';

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
  @Field(() => String, { nullable: true })
  personId?: string;

  @Field(() => String, { nullable: true })
  eventId?: string;

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
