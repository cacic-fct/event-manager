import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { PublicPlatformStats } from '@cacic-fct/event-manager-public-contracts';

export type PlatformStatsLoadState = 'loading' | 'ready' | 'unavailable';

@Component({
  selector: 'app-value-proposition',
  imports: [MatIconModule, DecimalPipe],
  templateUrl: './value-proposition.html',
  styleUrl: './value-proposition.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValuePropositionComponent {
  readonly stats = input<PublicPlatformStats | null>(null);
  readonly statsState = input<PlatformStatsLoadState>('loading');

  readonly statItems = computed(() => {
    const stats = this.stats();
    if (!stats) {
      return [];
    }

    return [
      { icon: 'groups', label: 'Cadastros', value: stats.peopleCount },
      { icon: 'calendar_month', label: 'Eventos', value: stats.eventsCount },
      { icon: 'workspace_premium', label: 'Grandes eventos', value: stats.majorEventsCount },
      { icon: 'verified', label: 'Certificados emitidos', value: stats.certificatesCount },
    ];
  });
}
