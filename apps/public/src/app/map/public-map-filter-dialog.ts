import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { PublicMapFilters } from './public-map.models';

export interface PublicMapFilterDialogData {
  filters: PublicMapFilters;
  isAuthenticated: boolean;
}

@Component({
  selector: 'app-public-map-filter-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatRadioModule],
  templateUrl: './public-map-filter-dialog.html',
  styleUrl: './public-map-filter-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicMapFilterDialog {
  readonly data = inject<PublicMapFilterDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<PublicMapFilterDialog, PublicMapFilters>>(MatDialogRef);

  readonly audience = signal(this.data.filters.audience);
  readonly date = signal(this.data.filters.date);

  clear(): void {
    this.audience.set('ALL');
    this.date.set('ALL');
  }

  apply(): void {
    this.dialogRef.close({ audience: this.audience(), date: this.date() });
  }
}
