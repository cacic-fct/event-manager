import { Injectable } from '@nestjs/common';
import { type M2MTotpSeedRelayResponse } from '@cacic-fct/account-manager-m2m-contracts';
import { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';

@Injectable()
export class AccountManagerTotpService {
  constructor(private readonly accountManager: AccountManagerGrpcClient) {}

  async relaySeed(userId: string): Promise<M2MTotpSeedRelayResponse> {
    return this.accountManager.relayTotpSeed(userId);
  }
}
