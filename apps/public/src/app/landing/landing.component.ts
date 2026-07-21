import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { PlatformStatsLoadState, ValuePropositionComponent } from './components/value-proposition.component';
import { MatIconModule } from '@angular/material/icon';
import { DoodlesComponent } from './components/doodles.component';
import { isPlatformBrowser } from '@angular/common';
import { Developer } from './components/developer';
import { PlatformStatsApiService } from './platform-stats-api.service';
import { catchError, map, of } from 'rxjs';
import { LandingFooterComponent } from './components/landing-footer.component';
import { DefaultRedirectService } from './default-redirect.service';

@Component({
  selector: 'app-login-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    ValuePropositionComponent,
    MatIconModule,
    RouterLink,
    DoodlesComponent,
    Developer,
    LandingFooterComponent,
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformStatsApi = inject(PlatformStatsApiService);
  private readonly defaultRedirect = inject(DefaultRedirectService);
  private readonly isDarkSignal = signal(false);

  private readonly nextSection = viewChild<ElementRef<HTMLElement>>('nextSection');

  // Data is intentionally delayed by two weeks to avoid exposing real-time platform statistics,
  // which could be used to infer operational information about users and events.
  readonly platformStats = toSignal(
    isPlatformBrowser(this.platformId)
      ? this.platformStatsApi.getPublicPlatformStats().pipe(
          map((stats) => ({ state: 'ready' as PlatformStatsLoadState, stats })),
          catchError(() => of({ state: 'unavailable' as PlatformStatsLoadState, stats: null })),
        )
      : of({ state: 'loading' as PlatformStatsLoadState, stats: null }),
    { initialValue: { state: 'loading' as PlatformStatsLoadState, stats: null } },
  );

  constructor() {
    if (isPlatformBrowser(this.platformId) && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      const listener = (event: MediaQueryListEvent) => {
        this.isDarkSignal.set(event.matches);
      };

      media.addEventListener('change', listener);

      this.destroyRef.onDestroy(() => {
        media.removeEventListener('change', listener);
      });
    }
  }

  async login(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.defaultRedirect.navigateToDefault(this.router);
      return;
    }
    await this.authService.login({ returnTo: '/app' });
  }

  scrollToNextSection(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.nextSection()?.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
}
