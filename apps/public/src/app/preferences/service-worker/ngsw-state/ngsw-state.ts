import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';
import { catchError, from, of, startWith, switchMap, Subject } from 'rxjs';

@Component({
  selector: 'app-ngsw-state',
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './ngsw-state.html',
  styleUrl: './ngsw-state.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgswState {
  private readonly serviceWorkerService = inject(ServiceWorkerService);
  readonly dialogRef = inject(MatDialogRef<NgswState>);

  private readonly refreshState$ = new Subject<void>();

  readonly ngswState = toSignal(
    this.refreshState$.pipe(
      startWith(undefined),
      switchMap(() =>
        from(this.serviceWorkerService.getDebugState()).pipe(
          catchError((error) => {
            console.error('Failed to read service worker state:', error);
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
