import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PrizeDraw, PrizeDrawEligibleEntry, PrizeDrawSpinResult } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { publicPrizeDrawUrl } from '@cacic-fct/shared-utils';
import { firstValueFrom, of } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PrizeDrawApiService } from '../graphql/prize-draw-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrizeDrawReelComponent } from '@cacic-fct/shared-angular';
import { AdminRouteResourceErrorService } from '../shared/admin-route-resource-error.service';
import { PrizeDrawResultDialogComponent, PrizeDrawResultDialogData } from './result/prize-draw-result-dialog.component';

@Component({
  selector: 'app-prize-draw-page',
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule, RouterLink, PrizeDrawReelComponent],
  templateUrl: './prize-draw-page.component.html',
  styleUrl: './prize-draw-page.component.scss',
})
export class PrizeDrawPageComponent {
  private readonly api = inject(PrizeDrawApiService);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly inWorkspaceShell = inject(ADMIN_SHELL_CONTEXT, { optional: true }) ?? false;
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeResourceErrors = inject(AdminRouteResourceErrorService);
  private requestGeneration = 0;
  private loadGeneration = 0;
  private readonly reel = viewChild(PrizeDrawReelComponent);

  protected readonly Permission = Permission;
  protected readonly permissions = inject(PermissionsService);
  readonly loading = signal(true);
  readonly requesting = signal(false);
  readonly draw = signal<PrizeDraw | null>(null);
  readonly entries = signal<PrizeDrawEligibleEntry[]>([]);
  readonly reelNames = computed(() => this.shortNames(this.entries()));
  readonly lastResult = signal<PrizeDrawSpinResult | null>(null);
  readonly reducedMotion = signal(false);
  private readonly queryParams = toSignal(this.route.queryParamMap ?? of(this.route.snapshot.queryParamMap), { initialValue: this.route.snapshot.queryParamMap });
  readonly demoMode = computed(() => this.queryParams().get('demo') === 'true');

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.destroyRef.onDestroy(() => { this.requestGeneration++; this.loadGeneration++; });
    if (typeof matchMedia === 'function') {
      const query = matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion.set(query.matches);
      const listener = (event: MediaQueryListEvent) => {
        this.reducedMotion.set(event.matches);
        if (event.matches) this.reel()?.requestReducedMotion();
      };
      query.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => query.removeEventListener('change', listener));
    }
    (this.route.paramMap ?? of(this.route.snapshot.paramMap)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.requestGeneration++;
      this.requesting.set(false);
      this.draw.set(null);
      this.entries.set([]);
      this.lastResult.set(null);
      void this.load();
    });
  }

  async run(demo: boolean): Promise<void> {
    const draw = this.draw();
    if (!draw || this.requesting() || !this.canDraw()) return;
    const generation = ++this.requestGeneration;
    this.requesting.set(true);
    this.lastResult.set(null);
    try {
      const result = await firstValueFrom(
        this.api.spin({ drawId: draw.id, demo, reducedMotion: this.reducedMotion() }),
      );
      if (generation !== this.requestGeneration) return;
      this.lastResult.set(result);
      await this.reel()?.play(result, this.reducedMotion());
      if (generation !== this.requestGeneration) return;
      await firstValueFrom(
        this.dialog
          .open<PrizeDrawResultDialogComponent, PrizeDrawResultDialogData, boolean>(PrizeDrawResultDialogComponent, {
            data: {
              result,
              reducedMotion: this.reducedMotion(),
              publicDrawUrl: this.publicDrawUrl(draw),
            },
            width: '100vw',
            height: '100dvh',
            maxWidth: '100vw',
            maxHeight: '100dvh',
            autoFocus: 'dialog',
            restoreFocus: true,
          })
          .afterClosed(),
      );
      if (!result.demo) await this.load(false);
      else this.reel()?.reset(this.shortNames(this.entries()));
    } catch (error) {
      if (generation === this.requestGeneration) {
        this.reel()?.reset(this.shortNames(this.entries()));
        this.feedback.error(
          error,
          demo
            ? 'Não foi possível executar a demonstração.'
            : 'O backend não confirmou o resultado. Nenhuma animação foi iniciada.',
        );
      }
    } finally {
      if (generation === this.requestGeneration) this.requesting.set(false);
    }
  }

  canDraw(): boolean {
    const draw = this.draw();
    if (!draw || draw.eligibleEntrantCount === 0) return false;
    const active = draw.spins.filter((spin) => !spin.undoneAt).length;
    return draw.spinLimit === null || draw.spinLimit === undefined || active < draw.spinLimit;
  }

  nextSpinLabel(): string {
    const draw = this.draw();
    if (!draw) return '';
    const active = draw.spins.filter((spin) => !spin.undoneAt).length;
    const planned = draw.plannedSpins.find((spin) => spin.position === active + 1);
    return planned?.description || `Giro ${active + 1}`;
  }

  private async load(showLoading = true): Promise<void> {
    const generation = ++this.loadGeneration;
    const drawId = this.route.snapshot.paramMap.get('drawId');
    if (!drawId) {
      this.loading.set(false);
      return;
    }
    if (showLoading) this.loading.set(true);
    try {
      const [draw, entries] = await Promise.all([
        firstValueFrom(this.api.get(drawId)),
        firstValueFrom(this.api.eligibleEntries(drawId)),
      ]);
      if (this.destroyRef.destroyed || generation !== this.loadGeneration) return;
      if (this.inWorkspaceShell && !this.route.snapshot.queryParamMap.has('eventId') && !this.route.snapshot.queryParamMap.has('majorEventId')) {
        void this.router.navigate([], { relativeTo: this.route, queryParams: this.scopeQuery(draw), queryParamsHandling: 'merge', replaceUrl: true });
      }
      this.draw.set(draw);
      this.entries.set(entries);
      this.lastResult.set(null);
      queueMicrotask(() => this.reel()?.reset(this.shortNames(entries)));
    } catch (error) {
      if (!this.destroyRef.destroyed && generation === this.loadGeneration &&
        !this.routeResourceErrors.redirectIfUnavailable(error)) {
        this.feedback.error(error, 'Não foi possível preparar o sorteio.');
      }
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }

  protected scopeQuery(draw: PrizeDraw): Record<string, string> {
    return { [draw.target.type === 'EVENT' ? 'eventId' : 'majorEventId']: draw.target.id };
  }

  private shortNames(entries: PrizeDrawEligibleEntry[]): string[] {
    return entries.map((entry) => {
      const parts = entry.displayName.trim().split(/\s+/).filter(Boolean);
      return parts.length > 1
        ? `${parts[0]} ${parts.at(-1)?.charAt(0).toLocaleUpperCase('pt-BR')}.`
        : (parts[0] ?? 'Participante');
    });
  }

  private publicDrawUrl(draw: PrizeDraw): string {
    const origin = isPlatformBrowser(this.platformId) ? window.location.origin : 'https://eventos.cacic.com.br';
    return publicPrizeDrawUrl(
      {
        drawId: draw.id,
        targetId: draw.target.id,
        targetType: draw.target.type,
      },
      origin,
    );
  }
}
