import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { FormField } from '@angular/forms/signals';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '../../../shared/components/twemoji.component';
import { WorkspaceCertificatesService } from '../../../shared/services/workspace-certificates.service';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-certificates-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormField,
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
  ],
  templateUrl: './workspace-certificates-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceCertificatesTabComponent {
  readonly workspace = inject(WorkspaceCertificatesService);
  private readonly route = inject(ActivatedRoute);
  protected readonly permissions = inject(WorkspacePermissionsService);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      void this.workspace.selectTargetByRoute(params.get('targetType'), params.get('targetId'), params.get('configId'));
    });
  }
}
