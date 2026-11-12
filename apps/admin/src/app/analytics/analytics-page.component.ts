import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import type {
  UmamiAnalyticsEvent,
  UmamiAnalyticsSource,
  UsageDashboard,
  UsageReport,
} from '@cacic-fct/shared-analytics';
import { map } from 'rxjs';
import { GraphqlHttpService } from '../graphql/graphql-http.service';

type AnalyticsPageState = { status: 'loading' | 'error' } | { status: 'ready'; report: UsageReport | null };

const SOURCE_LABELS: Record<UmamiAnalyticsSource, string> = {
  public: 'Site público',
  admin: 'Painel administrativo',
  operations: 'Infraestrutura',
};

const EVENT_LABELS: Record<UmamiAnalyticsEvent, string> = {
  login_button_attempt: 'Tentativas pelo botão de entrar',
  login_guard_redirect: 'Redirecionamentos para entrar',
  login_callback_expired: 'Retornos de login expirados',
  login_callback_failed: 'Falhas no retorno do login',
  silent_sso_failed: 'Falhas na verificação da sessão',
  calendar_search_completed: 'Buscas concluídas no calendário',
  calendar_view_changed: 'Trocas de visualização do calendário',
  event_detail_viewed: 'Visualizações de detalhes de eventos',
  event_share_link_copied: 'Links de eventos copiados para divulgação',
  self_attendance_confirmed: 'Presenças confirmadas pelo participante',
  collector_attendance_registered: 'Presenças registradas pelo coletor',
  major_event_registration_attempted: 'Envios de inscrição em grandes eventos',
  major_event_registration_saved: 'Inscrições em grandes eventos salvas',
  ticket_checkout_started: 'Compras de bilhete iniciadas',
  payment_pix_copied: 'Cópias de dados do Pix',
  product_action_failed: 'Falhas em inscrições, comprovantes e presença',
  ticket_receipt_submitted: 'Comprovantes de bilhete enviados',
  registration_receipt_submitted: 'Comprovantes de inscrição enviados',
  ticket_sale_approved: 'Compras de bilhete aprovadas',
  ticket_sale_rejected: 'Compras de bilhete recusadas',
  registration_payment_approved: 'Pagamentos de inscrição aprovados',
  registration_payment_rejected: 'Pagamentos de inscrição recusados',
  registration_payment_review_undone: 'Validações de pagamento desfeitas',
  backend_started: 'Inicializações do servidor',
  database_unavailable: 'Quedas do banco de dados',
  database_recovered: 'Recuperações do banco de dados',
  redis_unavailable: 'Quedas do Redis',
  redis_recovered: 'Recuperações do Redis',
  calendar_feed_maintenance_completed: 'Manutenções do calendário concluídas',
  calendar_feed_maintenance_failed: 'Falhas na manutenção do calendário',
};

@Component({
  selector: 'app-analytics-page',
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './analytics-page.component.html',
  styleUrls: ['../app-shell/layout/page-layout.shared.scss', './analytics-page.component.scss'],
})
export class AnalyticsPageComponent {
  private readonly graphql = inject(GraphqlHttpService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly state = signal<AnalyticsPageState>({ status: 'loading' });
  protected readonly dashboards = signal<UsageDashboard[]>([]);
  protected readonly sourceLabels = SOURCE_LABELS;
  protected readonly eventLabels = EVENT_LABELS;

  constructor() {
    this.load();
    this.graphql
      .request<{ usageDashboards: UsageDashboard[] }>(
        `
        query UsageDashboards {
          usageDashboards { source url }
        }
      `,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ usageDashboards }) => this.dashboards.set(usageDashboards),
        error: () => this.dashboards.set([]),
      });
  }

  protected load(): void {
    this.state.set({ status: 'loading' });
    this.graphql
      .request<{ usageReport: UsageReport | null }>(
        `
        query UsageReport {
          usageReport {
            startAt
            endAt
            sources {
              source
              events { name count }
            }
          }
        }
      `,
      )
      .pipe(
        map((data) => data.usageReport),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (report) => this.state.set({ status: 'ready', report }),
        error: () => this.state.set({ status: 'error' }),
      });
  }
}
