import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  PLATFORM_ID,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { CookieBanner, type CookieBannerOptions } from '@cacic-fct/account-manager-cookie-banner';

@Component({
  selector: 'app-cookie-banner',
  template: '<div #mount></div>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackageCookieBannerComponent implements OnDestroy {
  readonly config = input.required<CookieBannerOptions>();

  private readonly mount = viewChild<ElementRef<HTMLElement>>('mount');
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private banner: CookieBanner | null = null;

  constructor() {
    effect(() => {
      const mount = this.mount();
      const config = this.config();

      if (!this.isBrowser || !mount) {
        return;
      }

      this.banner?.destroy();
      this.banner = new CookieBanner({
        ...config,
        mount: mount.nativeElement,
        autoMount: false,
      });
      void this.banner.init();
    });
  }

  ngOnDestroy(): void {
    this.banner?.destroy();
  }
}
