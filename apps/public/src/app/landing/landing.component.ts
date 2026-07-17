import { ChangeDetectionStrategy, Component, ElementRef, inject, PLATFORM_ID, viewChild } from '@angular/core';
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
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { PlatformStatsApiService } from './platform-stats-api.service';
import { catchError, map, of } from 'rxjs';

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
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly featureFlags = inject(PublicFeatureFlagService);
  private readonly platformStatsApi = inject(PlatformStatsApiService);

  private readonly nextSection = viewChild<ElementRef<HTMLElement>>('nextSection');

  // Data is intentionally delayed by two weeks to avoid exposing real-time platform statistics,
  // which could be used to infer operational information about users and events.
  readonly platformStats = toSignal(
    this.platformStatsApi.getPublicPlatformStats().pipe(
      map((stats) => ({ state: 'ready' as PlatformStatsLoadState, stats })),
      catchError(() => of({ state: 'unavailable' as PlatformStatsLoadState, stats: null })),
    ),
    { initialValue: { state: 'loading' as PlatformStatsLoadState, stats: null } },
  );

  async login(): Promise<void> {
    const returnTo = this.featureFlags.stringValue('defaultLoginRedirectPath') ?? '/app/calendar';

    if (this.authService.isAuthenticated()) {
      await this.router.navigateByUrl(returnTo);
      return;
    }
    await this.authService.login({ returnTo });
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
