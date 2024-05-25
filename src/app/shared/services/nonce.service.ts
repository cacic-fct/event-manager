import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class NonceService {
  private nonceUrl = 'assets/nonce.txt';

  constructor(private http: HttpClient) {}

  fetchNonce(): Observable<string> {
    return this.http.get(this.nonceUrl, { responseType: 'text' });
  }
}
