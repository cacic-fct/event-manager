import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-eventos/shared-angular';
import { LandingComponent } from './landing.component';

/**
 * Root home component that:
 * - Shows landing page if user is not authenticated
 * - Automatically redirects to /menu if user is authenticated
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [LandingComponent],
  template: '<app-login-page></app-login-page>',
})
export class HomeComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/menu');
    }
  }
}
