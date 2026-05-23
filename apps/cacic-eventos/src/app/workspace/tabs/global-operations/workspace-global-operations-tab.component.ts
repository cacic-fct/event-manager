import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { CertificateApiService } from '../../../graphql/certificate-api.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog.component';
import { getErrorMessage } from '../../../shared/error-message';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';

@Component({
  selector: 'app-workspace-global-operations-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './workspace-global-operations-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
})
export class WorkspaceGlobalOperationsTabComponent {
  private readonly certificatesApi = inject(CertificateApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  protected readonly permissions = inject(WorkspacePermissionsService);

  readonly reissuingCertificates = signal(false);

  async reissueAllCertificates(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: {
            title: 'Confirmar operação global',
            actionDescription: 'a reemissão de certificados de todas as configurações',
            confirmLabel: 'Reemitir',
          },
          width: '420px',
        })
        .afterClosed(),
    );
    if (confirmed !== true) {
      return;
    }

    this.reissuingCertificates.set(true);
    try {
      const result = await firstValueFrom(this.certificatesApi.reissueAllCertificates());
      this.snackbar.open(
        `${result.certificateCount} certificado(s) processado(s) em ${result.configCount} configuração(ões).`,
        'Fechar',
        { duration: 3500 },
      );
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível reemitir os certificados.'), 'Fechar', {
        duration: 4500,
      });
    } finally {
      this.reissuingCertificates.set(false);
    }
  }
}
