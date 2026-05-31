import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AuthService, MailtoService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-help',
  imports: [MatIconModule, MatListModule, MatToolbarModule, RouterLink, MatButtonModule],
  templateUrl: './help.html',
  styleUrl: './help.css',
})
export class Help {
  private readonly mailtoService = inject(MailtoService);
  private readonly authService = inject(AuthService);

  mailto(): void {
    this.mailtoService.open({
      to: 'fctapp@googlegroups.com',
      subject: `[FCT-App] Suporte ao usuário`,
      body: `\n\n\n
=== Não apague os dados abaixo ===
userId: ${this.authService.user()?.sub || 'Desconhecido'}`,
    });
  }
}
