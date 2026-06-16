import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  EventManagerVotingAttendanceCheckRequest,
  EventManagerVotingAttendanceCheckResponse,
  EventManagerVotingEvent,
  EventManagerVotingPeopleLookupRequest,
  EventManagerVotingPeopleLookupResponse,
  EventManagerVotingPerson,
} from '@cacic-fct/event-manager-m2m-contracts';
import { ArrayMaxSize, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class VotingIntegrationEventDto implements EventManagerVotingEvent {
  @ApiProperty({ example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad' })
  id!: string;

  @ApiProperty({ example: 'Assembleia Geral' })
  name!: string;

  @ApiProperty({ example: '2026-06-16T19:00:00.000Z', format: 'date-time' })
  startDate!: string;

  @ApiProperty({ example: '2026-06-16T22:00:00.000Z', format: 'date-time' })
  endDate!: string;

  @ApiPropertyOptional({ example: 'Auditório principal', nullable: true })
  locationDescription?: string | null;

  @ApiProperty({
    example: true,
    description: 'Whether Event Manager is configured to collect attendance for this event.',
  })
  shouldCollectAttendance!: boolean;
}

export class VotingAttendanceCheckRequestDto implements EventManagerVotingAttendanceCheckRequest {
  @ApiProperty({ example: 'keycloak-user-id' })
  @IsString()
  @MaxLength(128)
  userId!: string;
}

export class VotingAttendanceCheckResponseDto implements EventManagerVotingAttendanceCheckResponse {
  @ApiProperty({ example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad' })
  eventId!: string;

  @ApiProperty({ example: 'keycloak-user-id' })
  userId!: string;

  @ApiProperty({ example: true })
  attended!: boolean;

  @ApiPropertyOptional({ example: '2026-06-16T19:12:00.000Z', format: 'date-time', nullable: true })
  attendedAt?: string | null;
}

export class VotingPeopleLookupRequestDto implements EventManagerVotingPeopleLookupRequest {
  @ApiProperty({
    example: ['20240001', '20240002'],
    type: [String],
    description: 'Enrollment numbers to resolve against active Event Manager people records.',
  })
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  enrollmentNumbers!: string[];
}

export class VotingPersonDto implements EventManagerVotingPerson {
  @ApiProperty({ example: '20240001' })
  enrollmentNumber!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  name!: string;

  @ApiPropertyOptional({ example: 'ada@example.com', nullable: true })
  email?: string | null;
}

export class VotingPeopleLookupResponseDto implements EventManagerVotingPeopleLookupResponse {
  @ApiProperty({ type: [VotingPersonDto] })
  @ValidateNested({ each: true })
  @Type(() => VotingPersonDto)
  people!: VotingPersonDto[];
}
