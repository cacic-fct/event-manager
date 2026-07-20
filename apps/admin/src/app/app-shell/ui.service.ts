import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ShellUiService {
  readonly loading = signal(false);
}
