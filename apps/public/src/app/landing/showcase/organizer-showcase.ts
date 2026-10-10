import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PrizeDrawDemoComponent } from './prize-draw-demo';
import { ORGANIZER_FEATURES, OrganizerFeature } from './showcase.fixtures';
import { ShowcaseStageComponent } from './showcase-stage';
import { RegistrationDemoComponent } from './registration-demo';
import { CertificateDemoComponent } from './certificate-demo';
import { DashboardDemoComponent } from './dashboard-demo';
import { AttendanceDemoComponent } from './attendance-demo';
import { AuditLogDemoComponent } from './audit-log-demo';
import { RoleDemoComponent } from './role-demo';

@Component({
  selector: 'app-landing-organizer-showcase',
  imports: [
    MatButtonModule,
    MatIconModule,
    PrizeDrawDemoComponent,
    ShowcaseStageComponent,
    RegistrationDemoComponent,
    CertificateDemoComponent,
    DashboardDemoComponent,
    AttendanceDemoComponent,
    AuditLogDemoComponent,
    RoleDemoComponent,
  ],
  templateUrl: './organizer-showcase.html',
  styleUrl: './organizer-showcase.scss',
})
export class OrganizerShowcaseComponent {
  readonly feature = model<OrganizerFeature>(ORGANIZER_FEATURES[0].id);
  readonly features = ORGANIZER_FEATURES;
  readonly activeFeature = computed(() => this.features.find((item) => item.id === this.feature()) ?? this.features[0]);
}
