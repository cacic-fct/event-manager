import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-developer',
  imports: [MatIconModule, MatButtonModule, MatSnackBarModule],
  templateUrl: './developer.html',
  styleUrl: './developer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Developer {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackBar = inject(MatSnackBar);

  readonly publicApiQuery = `query EventosPublicos {
  publicEvents(take: 3) {
    id
    name
    startDate
    locationDescription
  }
}`;

  readonly publicApiCurl = `curl --request POST 'https://eventos.cacic.com.br/api/graphql' \\
  --header 'content-type: application/json' \\
  --data '{"query":"query EventosPublicos { publicEvents(take: 3) { id name startDate locationDescription } }"}'`;

  readonly curlCopied = signal(false);

  async copyPublicApiCurl(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !navigator.clipboard?.writeText) {
      this.snackBar.open('Área de transferência indisponível.', 'OK', { duration: 3000 });
      return;
    }

    try {
      await navigator.clipboard.writeText(this.publicApiCurl);
      this.curlCopied.set(true);
      this.snackBar.open('Exemplo em curl copiado.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Não foi possível copiar o exemplo em curl.', 'OK', { duration: 5000 });
    }
  }
}
