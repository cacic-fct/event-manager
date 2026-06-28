import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import {
  PersonLinkedDataSummary,
  PersonLinkedResource,
  PersonLinkedResourcePage,
} from '@cacic-fct/event-manager-admin-contracts';
import { PeopleApiService } from '../../graphql/people-api.service';
import { ConfirmationDialogComponent, ConfirmationDialogData } from '../../shared/components/confirmation-dialog.component';
import { getErrorMessage } from '../../shared/error-message';

export interface PersonLinkedDataDialogData {
  personId: string;
  personName: string;
}

interface LinkedResourcePageState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly page: PersonLinkedResourcePage | null;
  readonly skip: number;
}

const LINKED_RESOURCE_PAGE_SIZE = 10;

@Component({
  selector: 'app-person-linked-data-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatExpansionModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
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
  readonly groupPages = signal<Record<string, LinkedResourcePageState>>({});
  readonly canDelete = computed(() => Boolean(this.summary()?.canDelete && !this.deleting()));

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.summary.set(await firstValueFrom(this.api.getPersonLinkedDataSummary(this.data.personId)));
      this.groupPages.set({});
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível carregar os vínculos da pessoa.'));
    } finally {
      this.loading.set(false);
    }
  }

  resourceDescription(item: PersonLinkedResource): string {
    return item.description || item.id;
  }

  groupPage(type: string): LinkedResourcePageState {
    return this.groupPages()[type] ?? this.emptyPageState();
  }

  rangeStart(page: PersonLinkedResourcePage): number {
    return page.total > 0 ? page.skip + 1 : 0;
  }

  rangeEnd(page: PersonLinkedResourcePage): number {
    return Math.min(page.skip + page.items.length, page.total);
  }

  canGoPrevious(type: string): boolean {
    const state = this.groupPage(type);
    return state.skip > 0 && !state.loading;
  }

  canGoNext(type: string): boolean {
    const state = this.groupPage(type);
    return Boolean(state.page && state.page.skip + state.page.take < state.page.total && !state.loading);
  }

  async loadGroup(type: string, skip = this.groupPage(type).skip): Promise<void> {
    const current = this.groupPage(type);
    if (current.loading) {
      return;
    }

    this.setGroupPage(type, { ...current, loading: true, error: null, skip });
    try {
      const page = await firstValueFrom(
        this.api.getPersonLinkedResources(this.data.personId, type, skip, LINKED_RESOURCE_PAGE_SIZE),
      );
      this.setGroupPage(type, {
        loading: false,
        error: null,
        page,
        skip: page.skip,
      });
    } catch (error) {
      this.setGroupPage(type, {
        ...this.groupPage(type),
        loading: false,
        error: getErrorMessage(error, 'Não foi possível carregar os registros deste vínculo.'),
        skip,
      });
    }
  }

  async ensureGroupLoaded(type: string): Promise<void> {
    if (!this.groupPage(type).page && !this.groupPage(type).loading) {
      await this.loadGroup(type, 0);
    }
  }

  async previousPage(type: string): Promise<void> {
    const state = this.groupPage(type);
    await this.loadGroup(type, Math.max(0, state.skip - LINKED_RESOURCE_PAGE_SIZE));
  }

  async nextPage(type: string): Promise<void> {
    const state = this.groupPage(type);
    await this.loadGroup(type, state.skip + LINKED_RESOURCE_PAGE_SIZE);
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

  private emptyPageState(): LinkedResourcePageState {
    return {
      loading: false,
      error: null,
      page: null,
      skip: 0,
    };
  }

  private setGroupPage(type: string, state: LinkedResourcePageState): void {
    this.groupPages.update((pages) => ({ ...pages, [type]: state }));
  }
}
