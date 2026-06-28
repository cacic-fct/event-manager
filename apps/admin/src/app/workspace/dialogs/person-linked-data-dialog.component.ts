import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PersonLinkedDataSummary, PersonLinkedResource } from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../graphql/people-api.service';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../../shared/components/confirmation-dialog.component';
import { getErrorMessage } from '../../shared/error-message';

export interface PersonLinkedDataDialogData {
  personId: string;
  personName: string;
}

@Component({
  selector: 'app-person-linked-data-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './person-linked-data-dialog.component.html',
  styleUrl: './person-linked-data-dialog.component.scss',
})
export class PersonLinkedDataDialogComponent {
  private readonly api = inject(PeopleApiService);
  private readonly dialog = inject(MatDialog);
  private readonly dialogRef = inject(MatDialogRef<PersonLinkedDataDialogComponent>);
  private readonly snackbar = inject(MatSnackBar);
  readonly data = inject<PersonLinkedDataDialogData>(MAT_DIALOG_DATA);

  readonly loading = signal(true);
  readonly deleting = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<PersonLinkedDataSummary | null>(null);
  readonly canDelete = computed(() => Boolean(this.summary()?.canDelete && !this.deleting()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.summary.set(await firstValueFrom(this.api.getPersonLinkedDataSummary(this.data.personId)));
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível carregar os vínculos da pessoa.'));
    } finally {
      this.loading.set(false);
    }
  }

  resourceDescription(item: PersonLinkedResource): string {
    return item.description || item.id;
  }

  async requestDelete(): Promise<void> {
    if (!this.canDelete()) {
      return;
    }

    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(ConfirmationDialogComponent, {
          data: {
            title: 'Excluir pessoa?',
            message:
              'Esta ação remove o cadastro da pessoa do workspace. Só continue se você confirmou que não há vínculos ativos.',
            confirmLabel: 'Excluir pessoa',
            cancelLabel: 'Cancelar',
            tone: 'danger',
          },
        })
        .afterClosed(),
    );

    if (!confirmed) {
      return;
    }

    this.deleting.set(true);
    try {
      const result = await firstValueFrom(this.api.deletePerson(this.data.personId));
      if (result.deleted) {
        this.snackbar.open('Pessoa excluída.', 'Fechar', { duration: 2500 });
        this.dialogRef.close(true);
        return;
      }
      this.snackbar.open('Não foi possível excluir a pessoa.', 'Fechar', { duration: 5000 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir a pessoa.'), 'Fechar', {
        duration: 5000,
      });
      await this.load();
    } finally {
      this.deleting.set(false);
    }
  }
}
