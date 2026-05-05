import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-value-proposition',
  imports: [MatIconModule],
  templateUrl: './value-proposition.component.html',
  styleUrl: './value-proposition.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ValuePropositionComponent {}
