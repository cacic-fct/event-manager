import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AuthService } from '@cacic-eventos/shared-angular';

@Component({
  selector: 'app-user-debug',
  imports: [JsonPipe],
  templateUrl: './user-debug.html',
  styleUrl: './user-debug.css',
})
export class UserDebug {
  public authService = inject(AuthService);
}
