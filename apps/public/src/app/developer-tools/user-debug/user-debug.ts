import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-user-debug',
  imports: [JsonPipe, MatToolbarModule, MatIconModule, MatButtonModule, RouterLink],
  templateUrl: './user-debug.html',
  styleUrl: './user-debug.css',
})
export class UserDebug {
  public authService = inject(AuthService);
}
