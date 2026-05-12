import { HttpClient } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { catchError, of, startWith, switchMap, Subject } from 'rxjs';

@Component({
  selector: 'app-ngsw-state',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './ngsw-state.html',
  styleUrl: './ngsw-state.css',
})
export class NgswState {
  private readonly http = inject(HttpClient);
  readonly dialogRef = inject(MatDialogRef<NgswState>);

  private readonly refreshState$ = new Subject<void>();

  readonly ngswState = toSignal(
    this.refreshState$.pipe(
      startWith(undefined),
      switchMap(() =>
        this.http.get('/ngsw/state', { responseType: 'text' }).pipe(
          catchError((error) => {
            console.error('Failed to fetch ngsw state:', error);
            return of('Erro ao carregar estado do Service Worker');
          }),
        ),
      ),
    ),
    {
      initialValue: 'Carregando...',
    },
  );

  refresh() {
    this.refreshState$.next();
  }

  close() {
    this.dialogRef.close();
  }
}
