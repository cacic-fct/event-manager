import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatOptionModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { SubscriptionEventList } from '../standard/event-list';
import { RankedSubscriptionStore } from './registration.store';

@Component({
  selector: 'app-ranked-subscription-select-step',
  imports: [MatButtonModule, MatFormFieldModule, MatIconModule, MatOptionModule, MatSelectModule, SubscriptionEventList],
  templateUrl: './select-step.html',
  styleUrls: ['../standard/page.css', './page.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankedSubscriptionSelectStep {
  readonly store = inject(RankedSubscriptionStore);
  readonly continue = output<void>();
}
