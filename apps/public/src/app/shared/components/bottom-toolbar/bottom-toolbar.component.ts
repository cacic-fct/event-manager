import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  input,
  inject,
  signal,
  effect,
  DestroyRef,
  NgZone,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ToolbarItem } from './bottom-toolbar.layout';

@Component({
  selector: 'app-bottom-toolbar',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './bottom-toolbar.component.html',
  styleUrls: ['./bottom-toolbar.component.scss'],
})
export class BottomToolbarComponent implements AfterViewInit {
  // keep your input form (uses angular 20 `input` helper)
  public readonly items = input.required<ToolbarItem[]>();

  // prefer a template reference variable (#toolbar) and ViewChild for measurement
  @ViewChild('toolbar', { read: ElementRef })
  private toolbarRef?: ElementRef<HTMLElement>;

  private readonly document = inject(DOCUMENT);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  // signal that holds the current measured height
  private readonly height = signal(0);

  // side-effect: whenever height changes, update CSS var on :root
  private readonly _syncToCssVar = effect(() => {
    const h = this.height();
    this.document.documentElement.style.setProperty(
      '--app-bottom-toolbar-height',
      `${h}px`,
    );
  });

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const toolbarEl = this.toolbarRef?.nativeElement ?? null;

    const setHeightFromEl = (el: HTMLElement | null) => {
      const height = el ? Math.round(el.getBoundingClientRect().height) : 0;
      this.height.set(height);
    };

    // initial read on the next animation frame so layout (fonts, safe-area, CSS) has settled
    requestAnimationFrame(() => setHeightFromEl(toolbarEl));

    // run ResizeObserver and window resize fallback outside Angular
    this.ngZone.runOutsideAngular(() => {
      // ResizeObserver if available
      let ro: ResizeObserver | undefined;
      if (typeof ResizeObserver !== 'undefined' && toolbarEl) {
        ro = new ResizeObserver(() => setHeightFromEl(toolbarEl));
        ro.observe(toolbarEl);
      }

      // window resize fallback
      const onWinResize = () => setHeightFromEl(toolbarEl);
      window.addEventListener('resize', onWinResize, { passive: true });

      // cleanup when the component is destroyed
      this.destroyRef.onDestroy(() => {
        ro?.disconnect();
        window.removeEventListener('resize', onWinResize);
      });
    });
  }
}
