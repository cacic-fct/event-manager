import { Component, ElementRef, afterRenderEffect, effect, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { TicketPersonSummaryComponent } from '../../profile/ticketing/ticket-person-summary.component';

type TransferStep = 'sender' | 'pending' | 'recipient' | 'received';

@Component({
  selector: 'app-landing-ticket-transfer-demo',
  imports: [MatButtonModule, MatIconModule, TicketPersonSummaryComponent, TwemojiComponent],
  templateUrl: './ticket-transfer-demo.html',
  styleUrl: './ticket-transfer-demo.scss',
})
export class TicketTransferDemoComponent {
  readonly incoming = input(false);
  readonly back = output<void>();
  readonly accepted = output<void>();

  readonly step = signal<TransferStep>('sender');
  private readonly focusPending = signal(false);

  readonly ticketName = 'Kit de boas-vindas';
  readonly eventName = 'Semana de Tecnologia';
  readonly eventTimeAndPlace = 'às 14:00, no Auditório';
  readonly senderName = 'Marina Costa';
  readonly recipientName = 'Rafael Almeida';

  private readonly stepHeading = viewChild<ElementRef<HTMLHeadingElement>>('stepHeading');

  constructor() {
    effect(() => {
      if (this.incoming()) {
        this.transitionTo('recipient');
      }
    });

    afterRenderEffect({
      write: () => {
        if (this.focusPending()) {
          const heading = this.stepHeading()?.nativeElement;
          if (heading) {
            heading.focus({ preventScroll: true });
            this.focusPending.set(false);
          }
        }
      },
    });
  }

  submitTransfer(): void {
    if (this.step() !== 'sender') {
      return;
    }

    this.transitionTo('pending');
  }

  viewReceipt(): void {
    if (this.step() === 'pending') {
      this.transitionTo('recipient');
    }
  }

  acceptTransfer(): void {
    if (this.step() !== 'recipient') {
      return;
    }

    this.transitionTo('received');
    this.accepted.emit();
  }

  returnToWallet(): void {
    this.back.emit();
  }

  private transitionTo(step: TransferStep): void {
    this.step.set(step);
    this.focusPending.set(true);
  }
}
