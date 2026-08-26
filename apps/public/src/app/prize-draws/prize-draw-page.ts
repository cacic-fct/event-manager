import { DOCUMENT, DatePipe, Location, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute } from '@angular/router';
import { PublicPrizeDraw, PublicPrizeDrawScopeType, PublicPrizeDrawSpin } from '@cacic-fct/event-manager-public-contracts';
import { publicPrizeDrawAnchorId } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import { PublicPrizeDrawApiService } from './prize-draw-api.service';

type PrizeDrawPageState =
  | { status: 'loading' }
  | { status: 'ready'; draws: PublicPrizeDraw[] }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-public-prize-draw-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  templateUrl: './prize-draw-page.html',
  styleUrl: './prize-draw-page.css',
})
export class PublicPrizeDrawPage {
  private readonly api = inject(PublicPrizeDrawApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly location = inject(Location);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<PrizeDrawPageState>({ status: 'loading' });
  readonly liveUpdatesUnavailable = signal(false);
  private deepLinkScrolled = false;

  private readonly targetType = this.route.snapshot.data['targetType'] as PublicPrizeDrawScopeType;
  private readonly targetId = this.route.snapshot.paramMap.get(this.targetParam())?.trim() ?? '';

  constructor() {
    void this.load();
    if (isPlatformBrowser(this.platformId) && this.targetId) {
      this.api
        .watch({ targetType: this.targetType, targetId: this.targetId })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => void this.load(true),
          error: () => this.liveUpdatesUnavailable.set(true),
        });
    }
  }

  goBack(): void {
    this.location.back();
  }

  modeLabel(draw: PublicPrizeDraw): string {
    return draw.chanceMode === 'EQUAL' ? 'Chances iguais' : 'Entradas ponderadas';
  }

  eligibilityLabel(draw: PublicPrizeDraw): string {
    const sources: string[] = [];
    if (draw.includePresent) sources.push('pessoas presentes');
    if (draw.includeSubscribers) sources.push('pessoas inscritas');
    if (draw.includeManualEntries) sources.push('entradas manuais');
    return sources.join(', ');
  }

  percentage(spin: PublicPrizeDrawSpin): string {
    const value = spin.totalWeight > 0 ? (spin.winnerWeight / spin.totalWeight) * 100 : 0;
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(value) + '%';
  }

  chance(spin: PublicPrizeDrawSpin): string {
    return `${spin.winnerWeight} em ${spin.totalWeight}`;
  }

  sourceTargetLabel(draw: PublicPrizeDraw): string {
    return draw.target.type === 'EVENT' ? `Evento: ${draw.target.name}` : `Grande evento: ${draw.target.name}`;
  }

  drawAnchorId(drawId: string): string {
    return publicPrizeDrawAnchorId(drawId);
  }

  private async load(background = false): Promise<void> {
    if (!this.targetId) {
      this.state.set({ status: 'error', message: 'Página de sorteios inválida.' });
      return;
    }
    if (!background) this.state.set({ status: 'loading' });
    try {
      const draws = await firstValueFrom(this.api.list({ targetType: this.targetType, targetId: this.targetId }));
      this.state.set({ status: 'ready', draws });
      this.liveUpdatesUnavailable.set(false);
      this.scrollToDeepLinkedDraw();
    } catch (error) {
      if (background && this.state().status === 'ready') {
        this.liveUpdatesUnavailable.set(true);
        return;
      }
      this.state.set({
        status: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível carregar os sorteios.',
      });
    }
  }

  private targetParam(): string {
    return {
      EVENT: 'eventId',
      EVENT_GROUP: 'eventGroupId',
      MAJOR_EVENT: 'majorEventId',
    }[this.targetType];
  }

  private scrollToDeepLinkedDraw(): void {
    if (!isPlatformBrowser(this.platformId) || this.deepLinkScrolled) return;
    const view = this.document.defaultView;
    const anchorId = view?.location.hash.slice(1) ?? '';
    if (!anchorId.startsWith('draw-')) return;
    view?.requestAnimationFrame(() => {
      const target = this.document.getElementById(anchorId);
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      this.deepLinkScrolled = true;
    });
  }
}
