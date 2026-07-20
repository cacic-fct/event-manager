import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { CertificateApiService } from '../../../graphql/certificate-api.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog.component';
import { getErrorMessage } from '../../../shared/error-message';
import { PermissionsService } from '../permissions/data-access/permissions.service';

@Component({
  selector: 'app-workspace-global-operations-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './global-operations-page.component.html',
  styleUrls: [
    '../../shared/styles/page-layout.shared.scss',
    '../../shared/styles/lists-layout.shared.scss',
    '../../shared/styles/entity-permissions.shared.scss',
    '../../shared/styles/forms-feedback.shared.scss',
  ],
})
export class GlobalOperationsPageComponent {
  private readonly certificatesApi = inject(CertificateApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  readonly reissuingCertificates = signal(false);

  async reissueAllCertificates(): Promise<void> {
    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: {
            title: 'Reemitir todos os certificados?',
            message: 'Esta operação tem escopo global e pode reprocessar arquivos já gerados.',
            details: [
              'Escopo: todas as configurações de certificado ativas.',
              'Use quando uma correção precisa ser refletida em todo o sistema.',
              'Evite executar durante atendimento, validação ou emissão manual em andamento.',
            ],
            confirmLabel: 'Reemitir certificados',
            tone: 'danger',
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
