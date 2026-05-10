import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-payment-info',
  imports: [MatButtonModule, MatIconModule, MatToolbarModule, RouterLink],
  templateUrl: './payment-info.html',
  styleUrl: './payment-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentInfo {
  private readonly route = inject(ActivatedRoute);

  readonly majorEventId =
    this.route.snapshot.paramMap.get('majorEventId') ??
    this.route.snapshot.paramMap.get('eventID') ??
    '';
}
