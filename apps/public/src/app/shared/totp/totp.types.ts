import type { TotpSeedPayload } from '@cacic-fct/account-manager-m2m-contracts';

export interface WalletTotpSeed extends TotpSeedPayload {
  sessionExpiresAt: number;
}
