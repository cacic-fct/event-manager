import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, Injector, PLATFORM_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ServerVersionApiService } from './server-version-api.service';

@Component({
  selector: 'app-about',
  imports: [MatToolbarModule, MatIconModule, MatListModule, MatButtonModule, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class About {
  private injector = inject(Injector);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly serverVersionApi = inject(ServerVersionApiService);

  private easterEggCounter = 0;

  readonly serverVersion = toSignal(
    isPlatformBrowser(this.platformId)
      ? this.serverVersionApi.getServerVersion().pipe(catchError(() => of(null)))
      : of(null),
    { initialValue: null },
  );

  async easterEgg() {
    if (this.easterEggCounter >= 7) {
      return;
    }

    this.easterEggCounter++;

    if (this.easterEggCounter === 7) {
      const { MatSnackBar } = await import('@angular/material/snack-bar');

      const snackBar = this.injector.get(MatSnackBar);

      snackBar.open('Tornar-se um desenvolvedor não é tão fácil como fizeram parecer...', 'Fechar', {
        duration: 3000,
      });
    }
  }
}
