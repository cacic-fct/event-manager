import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { auditTime, firstValueFrom, map } from 'rxjs';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import {
  ContentReviewsApi,
  type ContentReviewDecision,
  type ContentReviewGroup,
  type ContentReviewItem,
  type ContentReviewPage,
} from './content-reviews-api.service';

const FIELD_LABELS: Readonly<Record<string, string>> = {
  displayName: 'Nome de exibição',
  biography: 'Biografia',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
  photo: 'Foto do Google',
  profile: 'Criação do perfil',
};

@Component({
  selector: 'app-content-reviews-page',
  imports: [DatePipe, MatButtonModule, MatExpansionModule, MatProgressBarModule, NgTemplateOutlet, RouterLink],
  templateUrl: './content-reviews-page.component.html',
  styleUrl: './content-reviews-page.component.scss',
})
export class ContentReviewsPageComponent {
  private readonly api = inject(ContentReviewsApi);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly queueHeading = viewChild<ElementRef<HTMLHeadingElement>>('queueHeading');
  private readonly decisionAlert = viewChild<ElementRef<HTMLParagraphElement>>('decisionAlert');
  private request = 0;
  private refreshing = false;
  private refreshPending = false;

  readonly reviewId = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('review'))), {
    initialValue: null,
  });
  readonly result = signal<ContentReviewPage>({ groups: [], hasNextPage: false });
  readonly page = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly loadError = signal(false);
  readonly decisionError = signal('');
  readonly feedback = signal('');

  constructor() {
    inject(RealtimeApiService)
      .watchContentReviews()
      .pipe(auditTime(250), takeUntilDestroyed())
      .subscribe(() => {
        this.refreshPending = true;
        void this.refreshIfIdle();
      });

    effect(() => {
      this.reviewId();
      void this.load(0);
    });
  }

  async load(page = this.page()): Promise<void> {
    this.refreshPending = false;
    this.loading.set(true);
    this.loadError.set(false);
    this.decisionError.set('');
    await this.loadPage(page, false);
  }

  private async loadPage(page: number, background: boolean): Promise<void> {
    const request = ++this.request;
    const reviewId = this.reviewId();
    try {
      let result = await this.api.list(page, reviewId);
      while (request === this.request && result.groups.length === 0 && page > 0) {
        result = await this.api.list(--page, reviewId);
      }
      if (request !== this.request) return;
      this.result.set(result);
      this.page.set(page);
      this.loadError.set(false);
    } catch {
      if (request === this.request && !background) this.loadError.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
      if (background) this.refreshing = false;
      void this.refreshIfIdle();
    }
  }

  private async refreshIfIdle(): Promise<void> {
    if (this.destroyRef.destroyed || !this.refreshPending || this.refreshing || this.loading() || this.busy()) return;
    this.refreshPending = false;
    this.refreshing = true;
    await this.loadPage(this.page(), true);
  }

  fieldLabel(key: string): string {
    return FIELD_LABELS[key] ?? key;
  }

  itemLabel(group: ContentReviewGroup, item: ContentReviewItem): string {
    if (group.isProfile) return this.fieldLabel(item.key);
    if (!item.beforeMaterial) return 'Adicionar material';
    if (!item.afterMaterial) return 'Remover material';
    return 'Editar material';
  }

  actionLabel(group: ContentReviewGroup, item: ContentReviewItem, action: string): string {
    const operation = this.itemLabel(group, item);
    const title = (item.afterMaterial ?? item.beforeMaterial)?.title;
    return title ? `${action} - ${operation} - ${title}` : `${action} - ${operation}`;
  }

  async decide(
    group: ContentReviewGroup,
    items: ContentReviewItem[],
    decision: ContentReviewDecision,
    event: Event,
  ): Promise<void> {
    if (this.busy() || this.loading()) return;
    this.decisionError.set('');
    this.feedback.set('');
    const approved = decision === 'APPROVE';
    const trigger = event.currentTarget;
    this.busy.set(true);
    try {
      if (
        (!approved && group.isProfile) ||
        (approved && items.some((item) => !group.isProfile && !item.afterMaterial))
      ) {
        const confirmed = await firstValueFrom(
          this.dialog
            .open(ConfirmationDialogComponent, {
              restoreFocus: false,
              data: {
                title: approved ? 'Aprovar alterações nos materiais?' : 'Reverter alterações no perfil?',
                message: approved
                  ? 'Os materiais marcados para remoção deixarão de aparecer para os inscritos.'
                  : items.some(({ key }) => key === 'profile')
                    ? 'O perfil criado neste envio deixará de aparecer nos eventos.'
                    : 'Os dados publicados voltarão aos valores anteriores nas alterações selecionadas.',
                confirmLabel: approved ? 'Aprovar' : 'Reverter',
                cancelLabel: 'Cancelar',
                tone: 'danger',
              },
            })
            .afterClosed(),
        );
        if (!confirmed) {
          afterNextRender(
            () => {
              if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
              else this.queueHeading()?.nativeElement.focus();
            },
            { injector: this.injector },
          );
          return;
        }
      }
      await this.api.decide(
        group,
        items.map(({ key }) => key),
        decision,
      );
      this.feedback.set(
        approved ? 'Alterações aprovadas.' : group.isProfile ? 'Alterações revertidas.' : 'Alterações rejeitadas.',
      );
      await this.load();
      this.queueHeading()?.nativeElement.focus();
    } catch (error) {
      this.decisionError.set(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.');
      afterNextRender(() => this.decisionAlert()?.nativeElement.focus(), { injector: this.injector });
    } finally {
      this.busy.set(false);
      void this.refreshIfIdle();
    }
  }
}
