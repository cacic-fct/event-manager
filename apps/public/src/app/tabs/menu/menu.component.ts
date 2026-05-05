import { Component, inject } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@cacic-eventos/shared-angular';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-menu.component',
  imports: [
    MatListModule,
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css',
})
export class MenuComponent {
  readonly authService = inject(AuthService);
}
