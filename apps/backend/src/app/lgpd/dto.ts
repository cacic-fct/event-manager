import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LgpdUserRequestDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class LgpdDeletionRequestDto extends LgpdUserRequestDto {
  @ApiProperty({ example: 'account-deletion.schedule' })
  @IsString()
  event!: string;

  @ApiProperty({ example: 'delete-request-id' })
  @IsString()
  requestId!: string;

}
