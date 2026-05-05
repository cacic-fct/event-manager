import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceEventGroupsService } from '../../../shared/services/workspace-event-groups.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-workspace-event-groups-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatTooltipModule,
    TwemojiComponent,
    DatePipe,
  ],
  templateUrl: './workspace-event-groups-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceEventGroupsTabComponent {
  readonly workspace = inject(WorkspaceEventGroupsService);
  protected readonly permissions = inject(WorkspacePermissionsService);
}
