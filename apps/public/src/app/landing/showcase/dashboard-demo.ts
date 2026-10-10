import { Component, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import type { OrganizerFeature } from './showcase.fixtures';

@Component({
  selector: 'app-landing-dashboard-demo',
  imports: [MatButtonModule, MatIconModule, TwemojiComponent],
  templateUrl: './dashboard-demo.html',
  styleUrl: './dashboard-demo.scss',
})
export class DashboardDemoComponent {
  readonly openFeature = output<OrganizerFeature>();
}
