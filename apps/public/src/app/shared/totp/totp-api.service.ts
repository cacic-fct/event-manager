import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { WalletTotpSeed } from './totp.types';

@Service()
export class TotpApiService {
  private readonly http = inject(HttpClient);

  getSeed(): Observable<WalletTotpSeed> {
    return this.http.get<WalletTotpSeed>('/api/totp/seed');
  }
}
