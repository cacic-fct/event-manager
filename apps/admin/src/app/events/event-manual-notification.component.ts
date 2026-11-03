import { MAX_EVENT_NOTIFICATION_LENGTH, type EventNotificationAudience } from '@cacic-fct/shared-event-preparation';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  viewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormField, disabled, form, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

type NotificationAudience = EventNotificationAudience;
type NoticeDraft = { audience: NotificationAudience; message: string };
type NoticePreview = NoticeDraft & { eventId: string; eventName: string; requestId: string };

@Component({
  selector: 'app-event-manual-notification',
  imports: [FormField, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <section aria-labelledby="manual-notification-title">
      <h3 id="manual-notification-title">Enviar aviso sobre o evento</h3>
      <p>Escolha quem precisa receber a atualização. Salvar orientações da equipe ou materiais não envia este aviso.</p>
      @if (preview(); as notice) {
        <section class="preview" aria-label="Conferir aviso">
          <h4>Aviso da organização: {{ notice.eventName }}</h4>
          <p><strong>Destinatários:</strong> {{ audienceLabel(notice.audience) }}</p>
          <p class="message-body">{{ notice.message }}</p>
          <div class="actions">
            <button #sendButton mat-flat-button type="button" (click)="send()" [disabled]="sending() || !canSend()">
              {{ sending() ? 'Agendando…' : 'Enviar aviso' }}
            </button>
            <button mat-button type="button" (click)="backToEditing()" [disabled]="sending()">Voltar e editar</button>
          </div>
        </section>
      } @else {
        <form (submit)="$event.preventDefault(); review()">
          <mat-form-field>
            <mat-label>Quem deve receber?</mat-label>
            <mat-select [formField]="fields.audience">
              <mat-option value="LECTURERS">Palestrantes e ministrantes</mat-option>
              <mat-option value="SUBSCRIBERS" [disabled]="!published()">Inscritos no evento</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field>
            <mat-label>Mensagem do aviso</mat-label>
            <textarea
              #messageInput
              matInput
              rows="5"
              [formField]="fields.message"
              aria-describedby="notification-writing-hint"></textarea>
            <mat-hint align="end">{{ model().message.length }}/2.000</mat-hint>
          </mat-form-field>
          <p id="notification-writing-hint">
            Inclua o nome do evento, o que mudou, a data ou o horário e o que a pessoa precisa fazer. Prefira frases
            curtas e revise os links antes de enviar.
          </p>
          <p>
            Exemplo de estrutura: “Em {{ eventName() || 'nome do evento' }}, [o que mudou]. Em [data e horário], vá para
            [local]. Confira [próximo passo].”
          </p>
          <div class="actions">
            <button
              mat-stroked-button
              type="submit"
              [disabled]="!canSend() || fields().invalid() || !model().message.trim()">
              Conferir aviso
            </button>
            @if (model().message) {
              <button mat-button type="button" (click)="discard()">Descartar rascunho</button>
            }
          </div>
          @if (!published()) {
            <p>Publique o evento para enviar avisos aos inscritos.</p>
          }
        </form>
      }
      @if (feedback()) {
        <p role="status">{{ feedback() }}</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styles: `
    :host,
    section,
    form {
      display: grid;
      min-width: 0;
      gap: 1rem;
    }
    h3,
    h4,
    p {
      margin: 0;
    }
    h3,
    h4 {
      font: var(--mat-sys-title-medium);
    }
    p {
      color: var(--mat-sys-on-surface-variant);
      max-width: 70ch;
    }
    mat-form-field {
      width: 100%;
    }
    .preview {
      border: 1px solid var(--mat-sys-outline-variant);
      padding: 1rem;
    }
    .message-body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: var(--mat-sys-on-surface);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
  `,
})
export class EventManualNotificationComponent {
  readonly eventId = input.required<string>();
  readonly eventName = input('');
  readonly editable = input(false);
  readonly published = input(false);
  private readonly injector = inject(Injector);
  private readonly sendButton = viewChild<ElementRef<HTMLButtonElement>>('sendButton');
  private readonly messageInput = viewChild<ElementRef<HTMLTextAreaElement>>('messageInput');
  private readonly api = inject(EventPreparationApiService);
  readonly model = signal<NoticeDraft>({ audience: 'LECTURERS', message: '' });
  readonly canSend = computed(() => this.editable() && (this.model().audience === 'LECTURERS' || this.published()));
  readonly fields = form(this.model, (schema) => {
    required(schema.message);
    maxLength(schema.message, MAX_EVENT_NOTIFICATION_LENGTH);
    disabled(schema, () => !this.editable() || this.sending());
  });
  readonly preview = signal<NoticePreview | null>(null);
  readonly sending = signal(false);
  readonly feedback = signal('');
  readonly error = signal('');
  private request = 0;
  private readonly pending = inject(WorkspacePendingChangesService).register(() => this.discard());

  constructor() {
    effect(() => {
      this.eventId();
      this.request++;
      this.discard();
      this.sending.set(false);
      this.feedback.set('');
    });
    effect(() => this.pending.set(!!this.model().message.trim() || this.sending()));
    inject(DestroyRef).onDestroy(() => {
      this.request++;
      this.pending.destroy();
    });
  }
  audienceLabel(audience: NotificationAudience): string {
    return audience === 'LECTURERS'
      ? 'Palestrantes e ministrantes com conta vinculada'
      : 'Inscritos no evento com conta vinculada';
  }
  review(): void {
    if (!this.canSend() || this.fields().invalid() || !this.model().message.trim()) return;
    this.feedback.set('');
    this.error.set('');
    this.preview.set({
      ...this.model(),
      message: this.model().message.trim(),
      eventId: this.eventId(),
      eventName: this.eventName(),
      requestId: crypto.randomUUID(),
    });
    afterNextRender(() => this.sendButton()?.nativeElement.focus(), { injector: this.injector });
  }
  backToEditing(): void {
    this.preview.set(null);
    this.error.set('');
    afterNextRender(() => this.messageInput()?.nativeElement.focus(), { injector: this.injector });
  }
  discard(): void {
    this.model.set({ audience: 'LECTURERS', message: '' });
    this.preview.set(null);
    this.error.set('');
  }
  async send(): Promise<void> {
    const preview = this.preview();
    if (!preview || this.sending() || !this.canSend()) return;
    const request = this.request;
    this.sending.set(true);
    this.error.set('');
    try {
      const queued = await this.api.notifyParticipants(
        preview.eventId,
        preview.audience,
        preview.message,
        preview.requestId,
      );
      if (!queued) throw new Error('Não foi possível agendar o aviso. Tente novamente.');
      if (request !== this.request) return;
      this.discard();
      this.feedback.set('Aviso agendado. Consulte o histórico de auditoria para acompanhar o resultado do envio.');
    } catch (error) {
      if (request === this.request)
        this.error.set(error instanceof Error ? error.message : 'Não foi possível agendar o aviso. Tente novamente.');
    } finally {
      if (request === this.request) this.sending.set(false);
    }
  }
}
