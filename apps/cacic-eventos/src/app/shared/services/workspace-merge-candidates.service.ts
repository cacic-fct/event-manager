import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { MergeCandidateApiService } from '../../graphql/merge-candidate-api.service';
import { MergeCandidate, MergeCandidateStatus } from '../../graphql/models';
import { MergeCandidateDialogComponent } from '../../workspace/dialogs/merge-candidate-dialog.component';
import { WorkspacePeopleService } from './workspace-people.service';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceMergeCandidatesService {
  private readonly api = inject(MergeCandidateApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly peopleService = inject(WorkspacePeopleService);

  readonly mergeCandidates = signal<MergeCandidate[]>([]);
  readonly mergeFilterForm = this.formBuilder.nonNullable.group({
    status: ['PENDING'],
  });

  async refreshMergeCandidates(): Promise<void> {
    const status = this.mergeFilterForm.controls.status
      .value as MergeCandidateStatus;
    this.mergeCandidates.set(
      await firstValueFrom(this.api.listMergeCandidates({ status, take: 100 })),
    );
  }

  async scanMergeCandidates(showNotification = true): Promise<void> {
    const touchedCandidates = await firstValueFrom(
      this.api.scanMergeCandidates(),
    );
    await this.refreshMergeCandidates();
    if (showNotification) {
      this.snackbar.open(
        `${touchedCandidates} par(es) de possíveis duplicidades verificados.`,
        'Fechar',
        { duration: 2500 },
      );
    }
  }

  async setMergeCandidateStatus(
    candidate: MergeCandidate,
    status: MergeCandidateStatus,
  ): Promise<void> {
    await firstValueFrom(
      this.api.updateMergeCandidate(candidate.id, { status }),
    );
    await this.refreshMergeCandidates();
  }

  async deleteMergeCandidate(candidate: MergeCandidate): Promise<void> {
    await firstValueFrom(this.api.deleteMergeCandidate(candidate.id));
    await this.refreshMergeCandidates();
  }

  async mergeCandidate(candidate: MergeCandidate): Promise<void> {
    const dialogRef = this.dialog.open(MergeCandidateDialogComponent, {
      width: '72rem',
      maxWidth: '95vw',
      data: {
        candidate,
      },
    });

    const mergePlan = await firstValueFrom(dialogRef.afterClosed());
    if (!mergePlan) {
      return;
    }

    await firstValueFrom(
      this.api.mergeCandidatePeople({
        candidateId: candidate.id,
        targetPersonId: mergePlan.targetPersonId,
        migrateFields: mergePlan.migrateFields,
      }),
    );

    this.snackbar.open('Pessoas unificadas com sucesso.', 'Fechar', {
      duration: 2500,
    });
    await this.refreshMergeCandidates();
    await this.peopleService.searchPeople('');
  }

  async undoMergeCandidate(candidate: MergeCandidate): Promise<void> {
    await firstValueFrom(this.api.undoMergeCandidatePeople(candidate.id));
    this.snackbar.open('Unificação desfeita.', 'Fechar', { duration: 2500 });
    await this.refreshMergeCandidates();
    await this.peopleService.searchPeople('');
  }
}
