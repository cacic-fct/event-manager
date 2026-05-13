import { Component, inject, Injector } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceWorkerService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-about',
  imports: [MatToolbarModule, MatIconModule, MatListModule, MatButtonModule, RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  public serviceWorkerService = inject(ServiceWorkerService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);

  private easterEggCounter = 0;

  redirectToSw() {
    if (this.serviceWorkerService.hasServiceWorker()) {
      this.router.navigate(['service-worker'], {
        relativeTo: this.route,
      });
    }
  }

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
