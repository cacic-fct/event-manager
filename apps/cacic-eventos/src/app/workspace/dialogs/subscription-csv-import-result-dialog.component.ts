import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatListModule } from '@angular/material/list';
import { MajorEventSubscriptionCsvImportResult } from '../../graphql/models';

@Component({
  selector: 'app-subscription-csv-import-result-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatListModule],
  template: `
    <h2 mat-dialog-title>Importação concluída</h2>
    <div mat-dialog-content>
      <p>
        {{ data.createdSubscriptionCount }} inscrições criadas,
        {{ data.updatedSubscriptionCount }} atualizadas,
        {{ data.duplicateCount }} duplicadas, {{ data.failedCount }} falhas.
      </p>
      <p>{{ data.createdPeopleCount }} pessoas criadas automaticamente.</p>

      @if (data.createdPeople.length > 0) {
        <p>Pessoas criadas:</p>
        <mat-list>
          @for (person of data.createdPeople; track person.id) {
            <mat-list-item>
              <span matListItemTitle>{{ person.name }}</span>
              <span matListItemLine>
                {{
                  person.email ??
                    person.academicId ??
                    person.identityDocument ??
                    person.id
                }}
              </span>
            </mat-list-item>
          }
        </mat-list>
      }

      @if (data.failedRows.length > 0) {
        <p>Linhas não importadas:</p>
        <mat-list>
          @for (row of data.failedRows; track row) {
            <mat-list-item>
              <span matListItemTitle>{{ row }}</span>
            </mat-list-item>
          }
        </mat-list>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>OK</button>
    </div>
  `,
})
export class SubscriptionCsvImportResultDialogComponent {
  readonly data =
    inject<MajorEventSubscriptionCsvImportResult>(MAT_DIALOG_DATA);
}
