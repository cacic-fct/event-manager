import { Component } from '@angular/core';

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, catchError, Observable, retry, throwError } from 'rxjs';

@Component({
  selector: 'app-display-licenses',
  templateUrl: './display-licenses.component.html',
  styleUrls: ['./display-licenses.component.scss'],
})
export class DisplayLicensesComponent {
  licenses: Observable<string>;
  _error: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  error$: Observable<boolean> = this._error.asObservable();

  constructor(private http: HttpClient) {
    this.licenses = http.get('/3rdpartylicenses.txt', { responseType: 'text' }).pipe(
      retry(3),
      catchError((err) => {
        this._error.next(true);
        return this.handleError(err);
      })
    );
  }

  handleError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 0) {
      // A client-side or network error occurred.
      return throwError(() => new Error(`An error occurred: ${error.error}`));
    } else {
      // The backend returned an unsuccessful response code.
      return throwError(() => new Error(`Backend returned code ${error.status} for 3rdpartylicenses.txt request`));
    }
  }
}
