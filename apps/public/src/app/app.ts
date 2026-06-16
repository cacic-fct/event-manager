import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { CookieBannerComponent, CookieBannerOptions } from '@cacic-fct/cookie-banner/angular';
import { CacicAccountPrivacyService } from '@cacic/account-privacy';
import { firstValueFrom } from 'rxjs';
import { CookieBannerSyncService } from './privacy/cookie-banner-sync.service';
import { PublicFeatureFlagService } from './feature-flags/public-feature-flag.service';

@Component({
  imports: [RouterModule, CookieBannerComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly accountPrivacy = inject(CacicAccountPrivacyService);
  private readonly cookieBannerSync = inject(CookieBannerSyncService);
  private readonly featureFlags = inject(PublicFeatureFlagService);

  readonly cookieBannerEnabledOverride = input<boolean | null>(null);

  protected title = 'public';
  protected readonly cookieBannerEnabled = computed(
    () => this.cookieBannerEnabledOverride() ?? this.featureFlags.booleanValue('cookieBannerEnabled'),
  );
  protected readonly cookieBannerConfig: CookieBannerOptions = {
    privacyPolicyUrl: 'https://cacic.dev.br/legal/privacy-policy',
    isAuthenticated: () => this.auth.isAuthenticated(),
    onAccept: async (context) => {
      if (!context.isAuthenticated) {
        return;
      }

      const synced = await firstValueFrom(this.cookieBannerSync.acceptCookieBanner());
      if (!synced) {
        return false;
      }

      await firstValueFrom(this.accountPrivacy.refresh());
      return;
    },
  };
}
