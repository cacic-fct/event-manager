import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Permission } from '@cacic-fct/shared-permissions';
import { PublicAuthenticatedUser } from './public-authenticated-user';

export class LoginUrlResponseDto {
  @ApiProperty({
    description:
      'Keycloak authorization URL generated with the server-side authorization state bound to the auth state cookie.',
    example:
      'https://sso.cacic.com.br/realms/cacic-sso/protocol/openid-connect/auth?client_id=cacic-event-manager&response_type=code&scope=openid%20profile%20email&state=...',
  })
  authorizationUrl!: string;
}

export class RefreshSessionResponseDto {
  @ApiProperty({ description: 'Access-token expiration timestamp in milliseconds since epoch.', example: 1767225599000 })
  expiresAt!: number;

  @ApiProperty({ description: 'Server-side session expiration timestamp in milliseconds since epoch.', example: 1767229199000 })
  sessionExpiresAt!: number;
}

export class PasswordLoginRequestDto {
  @ApiProperty({ description: 'User email address.', example: 'aluno@unesp.br' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'User password.', example: '1', minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional({ description: 'Optional post-login destination for clients that track it.', example: '/admin/' })
  @IsOptional()
  @IsString()
  returnTo?: string;
}

export class PasswordLoginResponseDto extends RefreshSessionResponseDto {
  @ApiProperty({ description: 'Authenticated user resolved from the created session.', type: () => AuthenticatedUserResponseDto })
  user!: PublicAuthenticatedUser;
}

export class PermissionEvaluationRequestDto {
  @ApiProperty({
    description:
      'Permissions to evaluate against Event Manager policy rules and persisted permission grants. Empty strings are ignored and duplicate values are removed before evaluation.',
    example: [Permission.Event.Create, Permission.Event.Update, Permission.MajorEvent.Read],
    type: [String],
  })
  permissions!: string[];
}

export class PermissionEvaluationResponseDto {
  @ApiProperty({
    description: 'Permissions granted by Event Manager policy evaluation for the current access token.',
    example: [Permission.Event.Create, Permission.MajorEvent.Read],
    type: [String],
  })
  permissions!: string[];
}

export class RealmAccessDto {
  @ApiProperty({ description: 'Realm roles present in the access token.', example: ['offline_access', 'uma_authorization'], type: [String] })
  roles!: string[];
}

export class AuthenticatedUserResponseDto {
  @ApiProperty({ description: 'Realm-level access information extracted from the token.', type: RealmAccessDto })
  realm_access!: RealmAccessDto;

  @ApiPropertyOptional({ description: 'Subject identifier from the authenticated identity.', example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad' })
  sub?: string;

  @ApiPropertyOptional({ description: 'Preferred username claim from the identity provider.', example: 'joao.silva' })
  preferredUsername?: string;

  @ApiPropertyOptional({ description: 'Email claim when provided by the identity provider.', example: 'joao@cacic.com.br' })
  email?: string;

  @ApiProperty({ description: 'Normalized role list used by application authorization checks.', example: ['admin', 'event-manager'], type: [String] })
  roles!: string[];

  @ApiProperty({
    description: 'Normalized permission list resolved for the authenticated user.',
    example: [Permission.Event.Create, Permission.Event.Update, Permission.MajorEvent.Read],
    type: [String],
  })
  permissions!: string[];

  @ApiProperty({ description: 'OIDC scopes granted to the authenticated session.', example: ['openid', 'profile', 'email', 'identity-document'], type: [String] })
  oidcScopes!: string[];

  @ApiProperty({ description: 'Legacy alias for oidcScopes.', example: ['openid', 'profile', 'email'], type: [String] })
  scopes!: string[];

  @ApiProperty({
    description: 'Public allowlist of token claims needed by client applications.',
    type: 'object',
    additionalProperties: true,
    example: { iss: 'https://sso.cacic.com.br/realms/cacic-sso', aud: 'cacic-event-manager', typ: 'Bearer', is_onboarded: true },
  })
  claims!: Record<string, unknown>;
}
