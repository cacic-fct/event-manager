import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  inject,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { EventType } from '../../../graphql/models';
import { WorkspaceEventsService } from '../../../shared/services/workspace-events.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { EventFilterPanelComponent } from '../shared/event-filter-panel.component';

@Component({
  selector: 'app-workspace-events-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatSelectModule,
    MatTooltipModule,
    TwemojiComponent,
    EventFilterPanelComponent,
  ],
  templateUrl: './workspace-events-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceEventsTabComponent {
  @ViewChild(EventFilterPanelComponent)
  private eventFilterPanel?: EventFilterPanelComponent;
  readonly workspace = inject(WorkspaceEventsService);
  protected readonly permissions = inject(WorkspacePermissionsService);

  focusQuickSearch(): void {
    this.eventFilterPanel?.focusQuickSearch();
  }

  protected describeEventType(type: EventType | null | undefined): string {
    if (type === 'MINICURSO') {
      return 'Minicurso';
    }

    if (type === 'PALESTRA') {
      return 'Palestra';
    }

    return 'Outro';
  }
}
