import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { type CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner';
import { CacicAccountPrivacyService } from '@cacic-fct/account-manager-privacy';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { CookieBannerSyncService } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { CookieBannerFeatureFlagService } from './feature-flags/cookie-banner-feature-flag.service';
import { PackageCookieBannerComponent } from './privacy/package-cookie-banner.component';

@Component({
  imports: [RouterOutlet, PackageCookieBannerComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly accountPrivacy = inject(CacicAccountPrivacyService);
  private readonly cookieBannerSync = inject(CookieBannerSyncService);
  private readonly cookieBannerFeatureFlag = inject(CookieBannerFeatureFlagService);

  protected readonly title = 'CACiC Eventos';
  protected readonly cookieBannerEnabled = this.cookieBannerFeatureFlag.enabled;
  protected readonly cookieBannerConfig: CookieBannerOptions = {
    privacyPolicyUrl: 'https://cacic.dev.br/legal/privacy-policy',
    isAuthenticated: () => this.auth.isAuthenticated(),
    onAccept: async (context) => {
      if (!context.isAuthenticated) {
        return;
      }

      const synced = await firstValueFrom(this.cookieBannerSync.acceptCookieBanner());
      if (synced) {
        await firstValueFrom(this.accountPrivacy.refresh());
      }
      return;
    },
  };
}
