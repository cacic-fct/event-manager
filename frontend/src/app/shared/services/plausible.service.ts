import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PlausibleLocalService {
  /**
   * This is required by ngx-plausible
   */
  registerPlausible(): void {
    window.plausible =
      window.plausible ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function (...args: any) {
        // @ts-expect-error - This is defined by Plausible in main.ts
        (window.plausible.q = window.plausible.q || []).push(args);
      };
  }
}
