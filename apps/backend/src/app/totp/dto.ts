import { ApiProperty } from '@nestjs/swagger';
import {
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  type M2MTotpSeedRelayResponse,
} from '@cacic-fct/account-manager-m2m-contracts';

export class WalletTotpSeedDto implements M2MTotpSeedRelayResponse {
  @ApiProperty({
    description: 'Keycloak subject for the authenticated user.',
    example: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
  })
  userId!: string;

  @ApiProperty({
    description: 'Primary email to type together with the offline code.',
    example: 'joao.silva@unesp.br',
  })
  primaryEmail!: string;

  @ApiProperty({
    description: 'Base32 TOTP seed. The public app stores it only until the authenticated session expires.',
    example: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  })
  seed!: string;

  @ApiProperty({
    description: 'TOTP HMAC algorithm.',
    example: TOTP_ALGORITHM,
  })
  algorithm!: M2MTotpSeedRelayResponse['algorithm'];

  @ApiProperty({
    description: 'Number of TOTP digits.',
    example: TOTP_DIGITS,
  })
  digits!: M2MTotpSeedRelayResponse['digits'];

  @ApiProperty({
    description: 'TOTP step duration in seconds.',
    example: TOTP_PERIOD_SECONDS,
  })
  periodSeconds!: M2MTotpSeedRelayResponse['periodSeconds'];

  @ApiProperty({
    description: 'Account Manager server timestamp for clock diagnostics.',
    example: '2026-06-26T16:00:00.000Z',
  })
  serverTime!: string | Date;

  @ApiProperty({
    description: 'Event Manager server-side session expiration timestamp in milliseconds since epoch.',
    example: 1767229199000,
  })
  sessionExpiresAt!: number;
}
