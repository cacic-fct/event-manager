import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AztecScannerDialogComponent, ScannerFeedbackService } from '@cacic-fct/shared-angular';
import { catchError, combineLatest, finalize, map, of, switchMap } from 'rxjs';
import { EmojiService } from '../../shared/emoji.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from './online-attendance-api.service';

type AttendanceCodeState =
  | { status: 'loading' }
  | { status: 'ready'; item: PendingOnlineAttendanceEvent; total: number }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-online-attendance-code',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    ReactiveFormsModule,
  ],
  templateUrl: './online-attendance-code.component.html',
  styleUrl: './online-attendance-code.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineAttendanceCodeComponent {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private readonly scannerFeedback = inject(ScannerFeedbackService);

  readonly emoji = inject(EmojiService);
  readonly isSubmitting = signal(false);
  readonly codeValue = signal('');
  readonly codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(4)],
  });

  private readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('returnUrl') || '/menu')),
    { initialValue: '/menu' },
  );
  private readonly eventId = toSignal(this.route.paramMap.pipe(map((params) => params.get('eventId') || '')), {
    initialValue: '',
  });
  private readonly reloadCounter = signal(0);

  readonly slots = computed(() => this.codeValue().padEnd(4, ' '));
  readonly state = toSignal(this.createState(), {
    initialValue: { status: 'loading' } satisfies AttendanceCodeState,
  });

  constructor() {
    this.codeControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      const normalized = value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4);
      if (value !== normalized) {
        this.codeControl.setValue(normalized, { emitEvent: false });
      }
      this.codeValue.set(normalized);
    });
  }

  back(): void {
    const state = this.state();
    if (state.status === 'ready' && state.total > 1) {
      void this.router.navigate(['/attendance/register'], {
        queryParams: { returnUrl: this.returnUrl() },
      });
      return;
    }

    void this.router.navigateByUrl(this.returnUrl() || '/menu');
  }

  submit(): void {
    const state = this.state();
    if (state.status !== 'ready' || this.isSubmitting()) {
      return;
    }

    const code = this.codeControl.value.trim();
    if (code.length !== 4) {
      this.codeControl.markAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.api
      .confirmAttendance(state.item.eventId, code)
      .pipe(
        finalize(() => this.isSubmitting.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.scannerFeedback.show('valid');
          this.snackBar.open('Presença confirmada.', 'OK', { duration: 3000 });
          this.afterRegistration();
        },
        error: (error: unknown) => {
          this.scannerFeedback.show('invalid');
          this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível confirmar presença.', 'OK', {
            duration: 5000,
          });
        },
      });
  }

  scanCode(): void {
    const state = this.state();
    if (state.status !== 'ready' || this.isSubmitting()) {
      return;
    }

    const dialogRef = this.dialog.open(AztecScannerDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      data: {
        acceptedPrefixes: [`online-attendance:${state.item.eventId}:`],
        title: 'Escanear presença on-line',
      },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code) => {
        if (!code) {
          return;
        }

        const parsed = this.parseOnlineAttendanceCode(code);
        if (!parsed || parsed.eventId !== state.item.eventId) {
          this.scannerFeedback.show('invalid');
          this.snackBar.open('Código Aztec incompatível com este evento.', 'OK', {
            duration: 5000,
          });
          return;
        }

        this.codeControl.setValue(parsed.code);
        this.submit();
      });
  }

  private createState() {
    return combineLatest([this.route.paramMap, toObservable(this.reloadCounter)]).pipe(
      switchMap(() =>
        this.api.listPendingEvents().pipe(
          map((items): AttendanceCodeState => {
            const item = items.find(({ eventId }) => eventId === this.eventId());
            if (!item) {
              return {
                status: 'error',
                message: 'Não há presença pendente para este evento.',
              };
            }

            return { status: 'ready', item, total: items.length };
          }),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar a presença.',
            } satisfies AttendanceCodeState),
          ),
        ),
      ),
    );
  }

  private afterRegistration(): void {
    this.api
      .listPendingEvents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((items) => {
        if (items.length >= 2) {
          void this.router.navigate(['/attendance/register'], {
            queryParams: { returnUrl: this.returnUrl() },
          });
          return;
        }

        if (items.length === 1) {
          void this.router.navigate(['/attendance/register', items[0].eventId], {
            queryParams: { returnUrl: this.returnUrl() },
          });
          return;
        }

        void this.router.navigateByUrl(this.returnUrl() || '/menu');
      });
  }

  private parseOnlineAttendanceCode(rawCode: string): { eventId: string; code: string } | null {
    const [kind, eventId, code, ...extraParts] = rawCode.trim().split(':');
    if (kind !== 'online-attendance' || !eventId || !code || extraParts.length > 0) {
      return null;
    }

    return {
      eventId,
      code: code.toUpperCase(),
    };
  }
}
