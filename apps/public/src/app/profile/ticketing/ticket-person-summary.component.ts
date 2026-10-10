import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input, linkedSignal } from '@angular/core';

@Component({
  selector: 'app-ticket-person-summary',
  imports: [NgOptimizedImage],
  template: `
    <div class="person-summary">
      <div class="person-avatar" aria-hidden="true">
        @if (avatarSource(); as picture) {
          <img [ngSrc]="googlePictureUrl(picture)" width="56" height="56" alt="" referrerpolicy="no-referrer" (error)="avatarLoadFailed.set(true)" />
        } @else {
          <span>{{ initials() }}</span>
        }
      </div>
      @if (!avatarOnly()) {
        <div class="person-copy">
          <p class="person-name">{{ fullName() }}</p>
          @if (showDocument()) {
            <p class="person-document">{{ identityDocument() || 'Documento não informado' }}</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .person-summary {
      align-items: center;
      display: flex;
      gap: 0.875rem;
      min-width: 0;
    }

    .person-avatar {
      align-items: center;
      background: var(--ticket-person-avatar-background, var(--mat-sys-secondary-container));
      border-radius: 50%;
      color: var(--ticket-person-avatar-color, var(--mat-sys-on-secondary-container));
      display: flex;
      flex: 0 0 var(--ticket-person-avatar-size, 3.5rem);
      font: var(--ticket-person-avatar-font, var(--mat-sys-title-medium));
      height: var(--ticket-person-avatar-size, 3.5rem);
      justify-content: center;
      overflow: hidden;
      width: var(--ticket-person-avatar-size, 3.5rem);
    }

    .person-avatar img {
      display: block;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    .person-copy {
      min-width: 0;
    }

    .person-copy p {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .person-name {
      font: var(--mat-sys-title-medium);
      font-weight: 700;
    }

    .person-document {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
      margin-top: 0.2rem !important;
    }
  `,
})
export class TicketPersonSummaryComponent {
  readonly fullName = input.required<string>();
  readonly avatarUrl = input<string | null>(null);
  readonly identityDocument = input<string | null>(null);
  readonly showDocument = input(true);
  readonly avatarOnly = input(false);
  readonly avatarLoadFailed = linkedSignal({ source: this.avatarUrl, computation: () => false });
  readonly avatarSource = computed(() => this.avatarLoadFailed() ? null : this.avatarUrl());

  readonly initials = computed(() => {
    const words = this.fullName().trim().split(/\s+/u).filter(Boolean);
    if (!words.length) return '?';
    const first = words[0]?.[0] ?? '';
    const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
    return `${first}${last}`.toLocaleUpperCase();
  });

  googlePictureUrl(url: string): string {
    if (!url) return '';
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'lh3.googleusercontent.com') return url;
      return url.replace(/([=/])s\d+(?=[-/=]|$)/, '$1s512');
    } catch {
      return url;
    }
  }
}
