import { Component, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-landing-feedback-demo',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './feedback-demo.html',
  styleUrl: './feedback-demo.scss',
})
export class FeedbackDemoComponent {
  readonly rating = signal<number | null>(null);
  readonly responseSent = signal(false);
  readonly ratings = [1, 2, 3, 4, 5];

  submitResponse(): void {
    if (this.rating() !== null) this.responseSent.set(true);
  }

  resetResponse(): void {
    this.responseSent.set(false);
    this.rating.set(null);
  }
}
