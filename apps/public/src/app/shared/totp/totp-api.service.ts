import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { WalletTotpSeed } from './totp.types';

@Injectable({ providedIn: 'root' })
export class TotpApiService {
  private readonly http = inject(HttpClient);

  getSeed(): Observable<WalletTotpSeed> {
    return this.http.get<WalletTotpSeed>('/api/totp/seed');
  }
}
