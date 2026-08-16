import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RequestActivityService {
  private readonly pendingRequestCount = signal(0);

  readonly loading = computed(() => this.pendingRequestCount() > 0);

  begin(): () => void {
    this.pendingRequestCount.update((count) => count + 1);
    let finished = false;

    return () => {
      if (finished) {
        return;
      }
      finished = true;
      this.pendingRequestCount.update((count) => Math.max(0, count - 1));
    };
  }
}
