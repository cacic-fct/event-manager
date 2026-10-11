import { Component, input } from '@angular/core';
import { CookieBannerComponent, type CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner/angular';

@Component({
  selector: 'app-cookie-banner',
  imports: [CookieBannerComponent],
  template: '<lib-cookie-banner [config]="config()" />',
})
export class PackageCookieBannerComponent {
  readonly config = input.required<CookieBannerOptions>();
}
