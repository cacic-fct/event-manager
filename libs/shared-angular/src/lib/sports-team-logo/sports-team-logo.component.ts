import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'lib-sports-team-logo',
  imports: [MatIconModule],
  template: `
    <span class="team-logo" [style.width.px]="size()" [style.height.px]="size()" aria-hidden="true">
      @if (displayLogoUrl(); as logoUrl) {
        <img src="{{ logoUrl }}" alt="" [width]="size()" [height]="size()" (error)="handleLogoError(logoUrl)" />
      } @else {
        <mat-icon [style.font-size.px]="size()" [style.line-height.px]="size()">shield</mat-icon>
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-grid;
      flex: 0 0 auto;
      vertical-align: middle;
    }
    .team-logo {
      box-sizing: border-box;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 8px;
    }
    .team-logo img {
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 100%;
      padding: 2px;
      border-radius: inherit;
      object-fit: contain;
      background: var(--mat-sys-surface-container-highest);
    }
    .team-logo mat-icon {
      width: 100%;
      height: 100%;
      color: var(--mat-sys-on-surface-variant);
      font-size: inherit;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsTeamLogoComponent {
  readonly logoUrl = input<string | null | undefined>(null);
  readonly size = input(28);
  private readonly failedLogoUrl = signal<string | null>(null);

  readonly displayLogoUrl = computed(() => {
    const logoUrl = this.logoUrl();
    return logoUrl && logoUrl !== this.failedLogoUrl() ? logoUrl : null;
  });

  handleLogoError(logoUrl: string): void {
    this.failedLogoUrl.set(logoUrl);
  }
}
