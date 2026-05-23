import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import {
  ReceiptRejectionCode,
  ReceiptValidationApiService,
  ReceiptValidationEvent,
  ReceiptValidationQueue,
  ReceiptValidationQueueItem,
} from '../../../../graphql/receipt-validation-api.service';
import { getErrorMessage } from '../../../../shared/error-message';

interface LastValidationAction {
  id: string;
  label: string;
}

interface EventDayGroup {
  dayKey: string;
  dayLabel: string;
  events: ReceiptValidationEvent[];
}

@Component({
  selector: 'app-workspace-receipt-validation',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatTooltipModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './workspace-receipt-validation.component.html',
  styleUrls: ['../../workspace-tab.shared.scss', './workspace-receipt-validation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceReceiptValidationComponent {
  private readonly api = inject(ReceiptValidationApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly imageUnavailable = signal(false);
  protected readonly rejectPanelOpen = signal(false);
  protected readonly queue = signal<ReceiptValidationQueue>({ pendingCount: 0, items: [] });
  protected readonly selectedIndex = signal(0);
  protected readonly lastAction = signal<LastValidationAction | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedEventIds = signal<ReadonlySet<string>>(new Set());

  protected readonly rejectionForm = this.formBuilder.nonNullable.group({
    rejectionCode: this.formBuilder.nonNullable.control<ReceiptRejectionCode>('INVALID_RECEIPT', Validators.required),
    reason: ['', Validators.required],
  });

  protected readonly currentItem = computed(() => this.queue().items[this.selectedIndex()] ?? null);
  protected readonly currentPosition = computed(() =>
    this.queue().items.length === 0 ? 0 : Math.min(this.selectedIndex() + 1, this.queue().items.length),
  );
  protected readonly eventGroups = computed(() => this.groupEventsByDay(this.currentItem()?.events ?? []));
  protected readonly selectedEventCount = computed(() => this.selectedEventIds().size);

  constructor() {
    this.api
      .watchQueue()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (queue) => {
          this.queue.set(queue);
          this.loading.set(false);
          this.error.set(null);
          this.clampSelectedIndex(queue.items.length);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar a fila.');
          void this.refreshQueue();
        },
      });

    effect(() => {
      const item = this.currentItem();
      this.selectedEventIds.set(
        new Set(item?.events.filter((event) => event.selectedForConfirmation).map((event) => event.id) ?? []),
      );
      this.imageUnavailable.set(false);
      this.rejectPanelOpen.set(false);
      this.rejectionForm.reset({
        rejectionCode: 'INVALID_RECEIPT',
        reason: '',
      });
    });
  }

  protected previousReceipt(): void {
    this.selectedIndex.update((index) => Math.max(0, index - 1));
  }

  protected nextReceipt(): void {
    this.selectedIndex.update((index) => Math.min(this.queue().items.length - 1, index + 1));
  }

  protected async approve(item: ReceiptValidationQueueItem): Promise<void> {
    const receiptId = item.receipt?.id;
    if (!receiptId || this.saving() || !this.canApprove(item)) {
      return;
    }

    this.saving.set(true);
    try {
      const selectedEventIds = item.subscriptionFlow === 'RANKED_VOTING' ? [...this.selectedEventIds()] : undefined;
      const result = await firstValueFrom(this.api.approve(item.subscriptionId, receiptId, selectedEventIds));
      this.lastAction.set({ id: result.actionId, label: `Aprovação de ${item.personName}` });
      this.openUndoSnack();
      await this.refreshQueue();
    } catch (error) {
      this.showError(error, 'Não foi possível aprovar o comprovante.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async reject(item: ReceiptValidationQueueItem): Promise<void> {
    const receiptId = item.receipt?.id;
    if (this.rejectionForm.invalid || this.saving()) {
      return;
    }

    const formValue = this.rejectionForm.getRawValue();
    this.saving.set(true);
    try {
      const result = await firstValueFrom(
        this.api.reject(item.subscriptionId, receiptId, formValue.rejectionCode, formValue.reason),
      );
      this.lastAction.set({ id: result.actionId, label: `Recusa de ${item.personName}` });
      this.rejectPanelOpen.set(false);
      this.openUndoSnack();
      await this.refreshQueue();
    } catch (error) {
      this.showError(error, 'Não foi possível recusar o comprovante.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async undoLastAction(): Promise<void> {
    const action = this.lastAction();
    if (!action || this.saving()) {
      return;
    }

    this.saving.set(true);
    try {
      await firstValueFrom(this.api.undo(action.id));
      this.lastAction.set(null);
      this.snackbar.open('Validação desfeita.', 'Fechar', { duration: 2500 });
      await this.refreshQueue();
    } catch (error) {
      this.showError(error, 'Não foi possível desfazer a validação.');
    } finally {
      this.saving.set(false);
    }
  }

  protected openRejectPanel(): void {
    this.rejectPanelOpen.set(true);
  }

  protected closeRejectPanel(): void {
    this.rejectPanelOpen.set(false);
  }

  protected onImageError(): void {
    this.imageUnavailable.set(true);
  }

  protected formatPhoneWhatsApp(phone: string | null | undefined): string {
    if (!phone) {
      return '';
    }
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  protected statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  protected toggleEvent(event: ReceiptValidationEvent, checked: boolean): void {
    if (event.autoSubscribe) {
      return;
    }

    this.selectedEventIds.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(event.id);
      } else {
        next.delete(event.id);
      }
      return next;
    });
  }

  protected canApprove(item: ReceiptValidationQueueItem): boolean {
    if (item.subscriptionFlow !== 'RANKED_VOTING') {
      return true;
    }

    const selectedEvents = item.events.filter((event) => this.selectedEventIds().has(event.id));
    const recommendedEvents = item.events.filter((event) => event.selectedForConfirmation);
    return (
      this.countEventsByType(selectedEvents, 'MINICURSO') === this.countEventsByType(recommendedEvents, 'MINICURSO') &&
      this.countEventsByType(selectedEvents, 'PALESTRA') === this.countEventsByType(recommendedEvents, 'PALESTRA') &&
      this.countEventsByType(selectedEvents, 'OTHER') === this.countEventsByType(recommendedEvents, 'OTHER')
    );
  }

  protected rankedRequestLine(item: ReceiptValidationQueueItem): string {
    return [
      `${item.desiredCourses ?? 0} minicurso(s)`,
      `${item.desiredLectures ?? 0} palestra(s)`,
      `${item.desiredUncategorized ?? 0} outro(s)`,
    ].join(' · ');
  }

  protected hasOcrMatches(item: ReceiptValidationQueueItem): boolean {
    const receipt = item.receipt;
    return Boolean(
      receipt?.amountMatched === true ||
        receipt?.nameMatched === true ||
        receipt?.matchedAmountText ||
        receipt?.matchedNameText,
    );
  }

  private async refreshQueue(): Promise<void> {
    try {
      this.queue.set(await firstValueFrom(this.api.getQueue()));
      this.clampSelectedIndex(this.queue().items.length);
      this.error.set(null);
    } catch (error) {
      this.showError(error, 'Não foi possível atualizar a fila.');
    }
  }

  private clampSelectedIndex(length: number): void {
    if (length === 0) {
      this.selectedIndex.set(0);
      return;
    }
    this.selectedIndex.update((index) => Math.min(index, length - 1));
  }

  private groupEventsByDay(events: ReceiptValidationEvent[]): EventDayGroup[] {
    const groups = new Map<string, ReceiptValidationEvent[]>();
    for (const event of events) {
      const dayKey = event.startDate.slice(0, 10);
      groups.set(dayKey, [...(groups.get(dayKey) ?? []), event]);
    }

    return [...groups.entries()].map(([dayKey, dayEvents]) => ({
      dayKey,
      dayLabel: dayEvents[0]?.startDate ?? dayKey,
      events: dayEvents,
    }));
  }

  private countEventsByType(events: ReceiptValidationEvent[], type: ReceiptValidationEvent['type']): number {
    return events.filter((event) => event.type === type).length;
  }

  private openUndoSnack(): void {
    const snack = this.snackbar.open('Validação registrada.', 'Desfazer', { duration: 7000 });
    snack.onAction().subscribe(() => {
      void this.undoLastAction();
    });
  }

  private showError(error: unknown, fallback: string): void {
    const message = getErrorMessage(error, fallback);
    this.error.set(message);
    this.snackbar.open(message, 'Fechar', { duration: 4500 });
  }
}
