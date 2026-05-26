import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class AccountProfileUpdateDto {
  @ApiProperty({ example: 'keycloak-user-id' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'User Name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'User Full Name' })
  @IsOptional()
  @IsString()
  fullname?: string;

  @ApiPropertyOptional({ example: '+5518999999999' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  identityDocument?: string;

  @ApiPropertyOptional({ example: 'RA123456' })
  @IsOptional()
  @IsString()
  academicId?: string;

  @ApiPropertyOptional({ example: ['student'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
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
