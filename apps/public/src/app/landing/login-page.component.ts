import { Component, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Router } from '@angular/router';
import { AuthService, CacicLogoComponent } from '@cacic-eventos/shared-angular';
import { ValuePropositionComponent } from './components/value-proposition.component';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-login-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    ValuePropositionComponent,
    CacicLogoComponent,
    MatIconModule,
  ],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.scss'],
})
export class LoginPageComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigateByUrl('/');
    }
  }

  async login(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.router.navigateByUrl('/');
      return;
    }
    await this.authService.login();
  }
}
