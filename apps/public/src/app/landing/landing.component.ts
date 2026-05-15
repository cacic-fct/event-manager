import { Component, ElementRef, inject, PLATFORM_ID, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { ValuePropositionComponent } from './components/value-proposition.component';
import { MatIconModule } from '@angular/material/icon';
import { DoodlesComponent } from './components/doodles.component';
import { isPlatformBrowser } from '@angular/common';
import { Developer } from './components/developer';

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
})
export class LandingComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly nextSection = viewChild<ElementRef<HTMLElement>>('nextSection');

  async login(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.router.navigateByUrl('/calendar');
      return;
    }
    await this.authService.login();
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
