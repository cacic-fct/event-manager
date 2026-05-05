import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceUiService {
  readonly loading = signal(false);
}
