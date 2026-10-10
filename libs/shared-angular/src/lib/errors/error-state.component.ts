import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import { CacicLogoComponent } from '../cacic-logo/cacic-logo.component';
import { PageErrorStatus } from './route-error.service';

const ERROR_COPY: Record<PageErrorStatus, { title: string; description: string }> = {
  403: {
    title: 'Você não tem acesso a esta página.',
    description: 'Sua conta não tem permissão para acessar este conteúdo.',
  },
  404: {
    title: 'Página não encontrada.',
    description: 'Confira o endereço ou volte para a página inicial.',
  },
  500: {
    title: 'Não foi possível abrir esta página.',
    description: 'Ocorreu um problema ao carregar o conteúdo. Tente novamente mais tarde.',
  },
  503: {
    title: 'O serviço está indisponível no momento.',
    description: 'Não foi possível conectar ao serviço. Confira sua conexão e tente novamente mais tarde.',
  },
};

/** Also usable inline: the containing page chooses whether to replace its content. */
@Component({
  selector: 'lib-error-state',
  imports: [CacicLogoComponent, MatButtonModule, MatExpansionModule, MatIconModule, RouterLink],
  templateUrl: './error-state.component.html',
  styleUrl: './error-state.component.css',
})
export class ErrorStateComponent {
  readonly status = input<PageErrorStatus>(500);
  readonly title = input<string>();
  readonly description = input<string>();
  readonly actionLabel = input('Ir para a página inicial');
  readonly actionUrl = input('/');
  readonly actionHref = input<string>();
  readonly technicalDetails = input<string>();
  readonly retryLabel = input<string>();
  readonly retry = output<void>();
  readonly copy = computed(() => ERROR_COPY[this.status()]);
  readonly diagnostics = computed(
    () => this.technicalDetails() ?? JSON.stringify({ statusCode: this.status() }, null, 2),
  );
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly snackBar = inject(MatSnackBar);

  async copyDetails(): Promise<void> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!isPlatformBrowser(this.platformId) || !clipboard) {
      this.snackBar.open('Área de transferência indisponível.', 'OK', { duration: 3000 });
      return;
    }
    try {
      await clipboard.writeText(this.diagnostics());
      this.snackBar.open('Detalhes técnicos copiados.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Não foi possível copiar os detalhes.', 'OK', { duration: 3000 });
    }
  }
}
