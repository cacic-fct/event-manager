import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Refresh token hint used to invalidate the upstream Keycloak session when available.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCIgOiAiSldUIn0...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'ID token hint forwarded to Keycloak logout when available.',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCIgOiAiSldUIn0...',
  })
  @IsOptional()
  @IsString()
  idTokenHint?: string;

  @ApiPropertyOptional({
    description: 'Post-logout redirect URI accepted by the configured Keycloak client.',
    example: 'https://eventos.cacic.dev.br/',
  })
  @IsOptional()
  @IsString()
  postLogoutRedirectUri?: string;
}
