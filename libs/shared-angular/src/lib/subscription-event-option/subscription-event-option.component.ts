import { DatePipe } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { TwemojiComponent } from '../emoji/twemoji.component';
import type { SubscriptionEventOptionView } from './subscription-event-option.models';

@Component({
  selector: 'lib-subscription-event-option',
  imports: [DatePipe, MatButtonModule, MatCheckboxModule, MatIconModule, MatListModule, TwemojiComponent],
  templateUrl: './subscription-event-option.component.html',
  styleUrl: './subscription-event-option.component.css',
})
export class SubscriptionEventOptionComponent {
  readonly option = input.required<SubscriptionEventOptionView>();
  readonly selected = input(false);
  readonly disabled = input(false);
  readonly disabledReason = input<string | null>(null);
  readonly warningReason = input<string | null>(null);
  readonly interested = input(false);
  readonly readOnly = input(false);
  readonly showInfoButton = input(false);
  readonly showFullDate = input(false);

  readonly selectionChange = output<boolean>();
  readonly info = output<void>();

  protected isSelectionDisabled(): boolean {
    return this.disabled() || Boolean(this.disabledReason()) || this.readOnly();
  }

  protected onItemClick(): void {
    if (!this.isSelectionDisabled()) {
      this.selectionChange.emit(!this.selected());
    }
  }
}
