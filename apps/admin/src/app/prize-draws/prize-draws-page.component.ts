import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { PrizeDraw, PrizeDrawEligibleEntry, PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { publicPrizeDrawPath } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../app-shell/dialogs/confirmation-dialog.component';
import { PermissionsService } from '../permissions/permissions.service';
import { PersonSearchComponent } from '../people/person-search/person-search.component';
import { PrizeDrawWorkspaceService } from './prize-draw-workspace.service';

@Component({
  selector: 'app-prize-draws-page',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTabsModule,
    MatTooltipModule,
    PersonSearchComponent,
  ],
  providers: [PrizeDrawWorkspaceService],
  templateUrl: './prize-draws-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    '../app-shell/layout/workspace-tabs.shared.scss',
    './prize-draws-page.eligibility.scss',
    './prize-draws-page.component.scss',
  ],
})
export class PrizeDrawsPageComponent {
  readonly workspace = inject(PrizeDrawWorkspaceService);
  protected readonly Permission = Permission;
  protected readonly permissions = inject(PermissionsService);
  protected readonly speeds: PrizeDrawSpeed[] = ['INSTANT', 'QUICK', 'DRAMATIC'];
  private readonly dialog = inject(MatDialog);

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        void this.workspace.initialize(params.get('drawId'));
      });
  }

  speedLabel(speed: PrizeDrawSpeed): string {
    return { INSTANT: 'Instantâneo', QUICK: 'Rápido', DRAMATIC: 'Dramático' }[speed];
  }

  speedDescription(speed: PrizeDrawSpeed): string {
    return {
      INSTANT: 'Revela o resultado sem animação.',
      QUICK: 'Mistura veloz, desacelera brevemente e revela.',
      DRAMATIC: 'Usa contagem regressiva, passagens legíveis e uma revelação mais marcada.',
    }[speed];
  }

  publicDrawPath(draw: PrizeDraw): string {
    return publicPrizeDrawPath({
      drawId: draw.id,
      targetId: draw.target.id,
      targetType: draw.target.type,
    });
  }

  weightChanged(entry: PrizeDrawEligibleEntry, event: Event): void {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : 1;
    this.workspace.updateWeight(entry, value);
  }

  manualNameChanged(index: number, event: Event): void {
    const name = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.workspace.updateManualEntry(index, { name });
  }

  manualWeightChanged(index: number, event: Event): void {
    const weight = event.target instanceof HTMLInputElement ? Number(event.target.value) : 1;
    this.workspace.updateManualEntry(index, { weight });
  }

  plannedDescriptionChanged(index: number, event: Event): void {
    const description = event.target instanceof HTMLInputElement ? event.target.value : '';
    this.workspace.updatePlannedSpin(index, { description });
  }

  plannedSpeedChanged(index: number, speed: PrizeDrawSpeed): void {
    this.workspace.updatePlannedSpin(index, { speed });
  }

  plannedCountdownChanged(index: number, countdownSeconds: number): void {
    this.workspace.updatePlannedSpin(index, { countdownSeconds });
  }

  async confirmUndo(): Promise<void> {
    const latest = this.workspace.activeSpins().at(-1);
    if (!latest) return;
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(ConfirmationDialogComponent, {
          data: {
            title: 'Desfazer o último giro?',
            message: `O resultado de ${latest.winnerDisplayName} será invalidado, mas os IDs permanecerão no histórico de auditoria.`,
            details: [
              'A pessoa volta a ser elegível quando a remoção de vencedores estiver ativa.',
              'Notificações pendentes serão canceladas e as mensagens relacionadas serão removidas.',
            ],
            confirmLabel: 'Desfazer giro',
            tone: 'danger',
          },
          width: 'min(440px, 96vw)',
        })
        .afterClosed(),
    );
    if (confirmed) await this.workspace.undoLast();
  }
}
