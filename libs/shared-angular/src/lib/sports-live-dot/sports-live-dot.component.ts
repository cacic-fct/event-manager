import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { SportsBreathingAnimationService } from './sports-breathing-animation.service';

@Component({
  selector: 'lib-sports-live-dot',
  host: {
    'aria-hidden': 'true',
    '[style.opacity]': 'animation.breathingOpacity()',
  },
  template: '',
  styles: `
    :host {
      background: currentColor;
      border-radius: 50%;
      display: inline-block;
      flex: 0 0 8px;
      height: 8px;
      opacity: 1;
      width: 8px;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        opacity: 1 !important;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsLiveDotComponent implements OnInit, OnDestroy {
  readonly animation = inject(SportsBreathingAnimationService);
  private unsubscribe: () => void = () => undefined;

  ngOnInit(): void {
    this.unsubscribe = this.animation.subscribe();
  }

  ngOnDestroy(): void {
    this.unsubscribe();
  }
}
