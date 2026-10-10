import { Component, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-landing-receipt-demo',
  imports: [MatButtonModule, MatIconModule, TwemojiComponent],
  templateUrl: './receipt-demo.html',
  styleUrl: './receipt-demo.scss',
})
export class ReceiptDemoComponent {
  readonly back = output<void>();
  readonly receiptSubmitted = output<void>();
  readonly filename = signal('');
  readonly errorMessage = signal('');
  readonly submitted = signal(false);

  selectReceipt(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0];
    if (!file) return;
    this.errorMessage.set('');
    if (file.size > 15 * 1024 * 1024) {
      this.errorMessage.set('Escolha um arquivo de até 15 MB.');
      this.filename.set('');
      return;
    }
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.errorMessage.set('Escolha um comprovante em PDF ou imagem.');
      this.filename.set('');
      return;
    }
    // Only the filename is used in the showcase. File contents are never read or sent.
    this.filename.set(file.name);
    this.submitted.set(false);
  }

  sendReceipt(): void {
    if (!this.filename()) return;
    this.submitted.set(true);
    this.receiptSubmitted.emit();
  }
}
