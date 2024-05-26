import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PlausibleLocalService {
  /**
   * This is required by ngx-plausible
   */
  registerPlausible(): void {
    // @ts-ignore
    window.plausible =
      // @ts-ignore
      window.plausible ||
      function () {
        // @ts-ignore
        (window.plausible.q = window.plausible.q || []).push(arguments);
      };
  }
}
