import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AccountProfileUpdateDto {
  @ApiProperty({ example: 'keycloak-user-id' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  userId!: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({ example: 'User Name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ example: 'User Full Name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullname?: string;

  @ApiPropertyOptional({ example: '+5518999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[+0-9().\-\s]+$/)
  phone?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[0-9.\-\s]+$/)
  identityDocument?: string;

  @ApiPropertyOptional({ example: '20123456' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  academicId?: string;

  @ApiPropertyOptional({ example: ['student'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(32)
  @MaxLength(64, { each: true })
  unespRole?: string[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOnboarded?: boolean;
}

export class AccountProfileUpdateAcknowledgementDto {
  @ApiProperty({ example: 'success' })
  status!: 'success';

  @ApiProperty({ example: 'keycloak-user-id', nullable: true })
  userId!: string | null;

  @ApiProperty({ example: '018f1111-2222-7333-8444-555555555555', nullable: true })
  personId!: string | null;
}
