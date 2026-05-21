import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { CookieBannerComponent, CookieBannerOptions } from '@cacic-fct/cookie-banner/angular';
import { firstValueFrom } from 'rxjs';
import { CookieBannerSyncService } from './privacy/cookie-banner-sync.service';

@Component({
  imports: [RouterModule, CookieBannerComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly cookieBannerSync = inject(CookieBannerSyncService);

  protected title = 'public';
  protected readonly cookieBannerConfig: CookieBannerOptions = {
    privacyPolicyUrl: 'https://cacic.dev.br/legal/privacy-policy',
    isAuthenticated: () => this.auth.isAuthenticated(),
    onAccept: async (context) => {
      if (!context.isAuthenticated) {
        return;
      }

      return (await firstValueFrom(this.cookieBannerSync.acceptCookieBanner())) ? undefined : false;
    },
  };
}
