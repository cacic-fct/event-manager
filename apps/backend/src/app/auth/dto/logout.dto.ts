import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Post-logout redirect URI accepted by the configured Keycloak client.',
    example: 'https://eventos.cacic.com.br/',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2_048)
  postLogoutRedirectUri?: string;
}
