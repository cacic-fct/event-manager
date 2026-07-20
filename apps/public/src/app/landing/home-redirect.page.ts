import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { LandingComponent } from './landing-page';
import { DefaultRedirectService } from './default-redirect.service';

/**
 * Root home component that:
 * - Shows landing page if user is not authenticated
 * - Automatically resolves the highest-priority default route when authenticated
 */
@Component({
  selector: 'app-home',
  imports: [LandingComponent],
  template: `
    @if (!authService.isAuthenticated()) {
      <app-login-page />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly defaultRedirect = inject(DefaultRedirectService);

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      void this.navigateToDefaultRoute();
    }
  }

  private async navigateToDefaultRoute(): Promise<void> {
    await this.router.navigateByUrl(await this.defaultRedirect.resolve());
  }
}
