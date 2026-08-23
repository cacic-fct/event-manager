import { Service, signal } from '@angular/core';

@Service()
export class ShellUiService {
  readonly loading = signal(false);
}
