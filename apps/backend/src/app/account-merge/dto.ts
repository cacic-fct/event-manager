import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsDateString, IsString } from 'class-validator';

export class AccountMergeScoreRequestDto {
  @ApiProperty({
    example: ['candidate-a', 'candidate-b'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  userIds!: string[];
}

export class AccountMergeScoreResponseDto {
  @ApiProperty({
    example: {
      'candidate-a': 45,
      'candidate-b': 115,
    },
  })
  scores!: Record<string, number>;
}

export class AccountMergeNotificationDto {
  @ApiProperty({ example: '018f1111-2222-7333-8444-555555555555' })
  @IsString()
  eventId!: string;

  @ApiProperty({ example: 'account.merged' })
  @IsString()
  type!: string;

  @ApiProperty({ example: 'old-keycloak-user-id' })
  @IsString()
  oldUserId!: string;

  @ApiProperty({ example: 'new-keycloak-user-id' })
  @IsString()
  newUserId!: string;

  @ApiProperty({ example: '2026-05-08T12:00:00.000Z' })
  @IsDateString()
  occurredAt!: string;
}

export class AccountMergeAcknowledgementDto {
  @ApiProperty({ example: '018f1111-2222-7333-8444-555555555555' })
  eventId!: string;

  @ApiProperty({ example: 'account.merged' })
  type!: string;

  @ApiProperty({ example: 'old-keycloak-user-id' })
  oldUserId!: string;

  @ApiProperty({ example: 'new-keycloak-user-id' })
  newUserId!: string;

  @ApiProperty({ example: 'success' })
  status!: 'success';
}
