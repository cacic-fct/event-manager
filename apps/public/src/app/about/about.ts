import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { ServiceWorkerService } from '@cacic-eventos/shared-angular';

@Component({
  selector: 'app-about',
  imports: [
    MatToolbarModule,
    MatIconModule,
    MatListModule,
    MatButtonModule,
    RouterLink,
  ],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  public serviceWorkerService = inject(ServiceWorkerService);
}
