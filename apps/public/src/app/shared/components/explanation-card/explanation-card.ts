import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-explanation-card',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './explanation-card.html',
  styleUrl: './explanation-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplanationCard {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
}
