import { AsyncPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit } from '@angular/core';
import {
  IonTitle,
  IonHeader,
  IonContent,
  IonButton,
  IonInput,
  IonItem,
  IonButtons,
  IonToolbar,
  ModalController,
  IonProgressBar,
  IonIcon,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline } from 'ionicons/icons';
import { catchError, map, Observable, retry, throwError } from 'rxjs';

@Component({
  selector: 'app-service-worker-status-modal',
  templateUrl: './service-worker-status-modal.component.html',
  styleUrls: ['./service-worker-status-modal.component.scss'],
  imports: [
    IonIcon,
    IonProgressBar,
    IonTitle,
    IonHeader,
    IonContent,
    IonButton,
    IonInput,
    IonItem,
    IonButtons,
    IonToolbar,
    AsyncPipe,
  ],
  standalone: true,
})
export class ServiceWorkerStatusModalComponent {
  private http = inject(HttpClient);
  private modalController = inject(ModalController);
  ngswState$: Observable<string> | undefined;
  constructor() {
    this.requestData();
    addIcons({
      refreshOutline,
      closeOutline,
    });
  }

  requestData() {
    this.ngswState$ = this.http.get('/ngsw/state', { responseType: 'text' }).pipe(
      retry(3),
      catchError((err) => {
        return this.handleError(err);
      }),
      map((response) => {
        if (response.includes('NGSW Debug Info:')) {
          return response;
        } else {
          return 'No service worker is active.';
        }
      }),
    );
  }

  handleError(error: HttpErrorResponse): Observable<never> {
    if (error.status === 0) {
      // A client-side or network error occurred.
      return throwError(() => new Error(`An error occurred: ${error.error}`));
    } else {
      // The backend returned an unsuccessful response code.
      return throwError(() => new Error(`Backend returned code ${error.status} for /ngsw/state request`));
    }
  }

  close() {
    this.modalController.dismiss();
  }
}
