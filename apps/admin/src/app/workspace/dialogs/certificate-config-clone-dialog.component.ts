import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import {
  CertificateConfig,
  CertificateScope,
  CertificateConfigClonePartsInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { CertificateApiService } from '../../graphql/certificate-api.service';
import { TwemojiComponent } from '../../shared/components/twemoji.component';

type CertificateCloneTargetOption = {
  id: string;
  name: string;
  emoji: string;
  dateLabel: string;
};

export type CertificateConfigCloneDialogData = {
  config: CertificateConfig;
  defaultName: string;
  canCopyIssuedPeople: boolean;
};

export type CertificateConfigCloneDialogResult = {
  name: string;
  scope: CertificateScope;
  targetId: string;
  parts: CertificateConfigClonePartsInput;
};

@Component({
  selector: 'app-certificate-config-clone-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    TwemojiComponent,
  ],
  template: `
    <h2 mat-dialog-title>Duplicar configuração de certificado</h2>
    <div mat-dialog-content class="content">
      <form [formGroup]="form" class="form-grid">
        <mat-form-field>
          <mat-label>Nome da cópia</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>

        <mat-form-field>
          <mat-label>Escopo de destino</mat-label>
          <mat-select formControlName="scope" (selectionChange)="onScopeChanged($event.value)">
            <mat-option value="EVENT">Evento</mat-option>
            <mat-option value="EVENT_GROUP">Grupo</mat-option>
            <mat-option value="MAJOR_EVENT">Grande evento</mat-option>
            <mat-option value="OTHER">Certificados avulsos</mat-option>
          </mat-select>
        </mat-form-field>
      </form>

      <section class="target-section" aria-label="Item de destino">
        <header>
          <h3>Destino</h3>
          <span>{{ targets().length }} itens</span>
        </header>

        @if (loading()) {
          <mat-progress-bar mode="indeterminate" />
        }

        <mat-list class="target-list">
          @for (target of targets(); track target.id) {
            <mat-list-item
              class="target-item"
              [class.selected-target]="selectedTargetId() === target.id"
              (click)="selectTarget(target.id)">
              <span matListItemIcon>
                <app-twemoji [emoji]="target.emoji" />
              </span>
              <span matListItemTitle>{{ target.name }}</span>
              <span matListItemLine>{{ target.dateLabel }}</span>
              @if (selectedTargetId() === target.id) {
                <mat-icon matListItemMeta>check_circle</mat-icon>
              }
            </mat-list-item>
          } @empty {
            <mat-list-item>
              <mat-icon matListItemIcon>search_off</mat-icon>
              <span matListItemTitle>Nenhum destino encontrado</span>
              <span matListItemLine>Escolha outro escopo para continuar.</span>
            </mat-list-item>
          }
        </mat-list>
      </section>

      <section class="parts-section" aria-label="Informações para manter">
        <h3>Manter informações</h3>
        <div class="part-grid">
          <mat-checkbox [formControl]="partControls.textContent">
            Textos do certificado
          </mat-checkbox>
          <mat-checkbox [formControl]="partControls.recipientData">
            Destinatário e campos
          </mat-checkbox>
          <mat-checkbox [formControl]="partControls.activeState">
            Status
          </mat-checkbox>
          <mat-checkbox [formControl]="partControls.issuedPeople">
            Pessoas já emitidas
          </mat-checkbox>
        </div>
      </section>
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="form.invalid || !selectedTargetId()" (click)="confirmClone()">
        <mat-icon>content_copy</mat-icon>
        Duplicar
      </button>
    </div>
  `,
  styles: [
    `
      .content {
        display: grid;
        gap: 1rem;
        min-width: min(52rem, calc(100vw - 3rem));
      }

      .form-grid {
        display: grid;
        grid-template-columns: minmax(16rem, 1fr) minmax(14rem, 0.7fr);
        gap: 0.75rem;
      }

      .target-section,
      .parts-section {
        display: grid;
        gap: 0.625rem;
      }

      .target-section header {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: center;
      }

      h3 {
        margin: 0;
        font: var(--mat-sys-title-small);
      }

      .target-section header span {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }

      .target-list {
        max-height: min(22rem, 45vh);
        overflow: auto;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
      }

      .target-item {
        cursor: pointer;
      }

      .selected-target {
        background: color-mix(in srgb, var(--mat-sys-primary) 9%, transparent);
      }

      .part-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.25rem 1rem;
      }

      @media (max-width: 760px) {
        .content {
          min-width: 0;
        }

        .form-grid,
        .part-grid {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class CertificateConfigCloneDialogComponent {
  protected readonly data = inject<CertificateConfigCloneDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(
    MatDialogRef<CertificateConfigCloneDialogComponent, CertificateConfigCloneDialogResult | null>,
  );
  private readonly api = inject(CertificateApiService);
  private readonly dateFormatter = new Intl.DateTimeFormat('pt-BR');

  protected readonly targets = signal<CertificateCloneTargetOption[]>([]);
  protected readonly loading = signal(false);
  protected readonly selectedTargetId = signal<string | null>(this.getConfigTargetId(this.data.config));
  private requestedTargetScope = this.data.config.scope;
  protected readonly form = new FormGroup({
    name: new FormControl(this.data.defaultName, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    scope: new FormControl(this.data.config.scope, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  protected readonly partControls = {
    textContent: new FormControl(true, { nonNullable: true }),
    recipientData: new FormControl(true, { nonNullable: true }),
    activeState: new FormControl(true, { nonNullable: true }),
    issuedPeople: new FormControl(
      {
        value: false,
        disabled: !this.data.canCopyIssuedPeople,
      },
      { nonNullable: true },
    ),
  };

  constructor() {
    void this.loadTargets(this.form.controls.scope.value);
  }

  protected onScopeChanged(scope: CertificateScope): void {
    this.selectedTargetId.set(null);
    void this.loadTargets(scope);
  }

  protected selectTarget(targetId: string): void {
    this.selectedTargetId.set(targetId);
  }

  protected confirmClone(): void {
    const targetId = this.selectedTargetId();
    if (this.form.invalid || !targetId) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      name: this.form.controls.name.value.trim(),
      scope: this.form.controls.scope.value,
      targetId,
      parts: {
        textContent: this.partControls.textContent.value,
        recipientData: this.partControls.recipientData.value,
        activeState: this.partControls.activeState.value,
        issuedPeople: this.partControls.issuedPeople.value,
      },
    });
  }

  private async loadTargets(scope: CertificateScope): Promise<void> {
    this.requestedTargetScope = scope;
    this.loading.set(true);
    try {
      const targets = await this.fetchTargetsForScope(scope);
      if (this.requestedTargetScope !== scope || this.form.controls.scope.value !== scope) {
        return;
      }
      this.targets.set(this.withCurrentTarget(scope, targets));
    } catch {
      if (this.requestedTargetScope === scope && this.form.controls.scope.value === scope) {
        this.targets.set([]);
      }
    } finally {
      if (this.requestedTargetScope === scope && this.form.controls.scope.value === scope) {
        this.loading.set(false);
      }
    }
  }

  private async fetchTargetsForScope(scope: CertificateScope): Promise<CertificateCloneTargetOption[]> {
    switch (scope) {
      case 'EVENT':
        return (await firstValueFrom(this.api.listCertificateIssuableEvents({ take: 50 }))).map((eventItem) => ({
          id: eventItem.id,
          name: eventItem.name,
          emoji: eventItem.emoji,
          dateLabel: this.formatRange(eventItem.startDate, eventItem.endDate),
        }));
      case 'EVENT_GROUP':
        return (await firstValueFrom(this.api.listCertificateIssuableEventGroups({ take: 50 }))).map((group) => ({
          id: group.id,
          name: group.name,
          emoji: group.emoji,
          dateLabel: `Criado em ${this.formatDate(group.createdAt)}`,
        }));
      case 'MAJOR_EVENT':
        return (await firstValueFrom(this.api.listCertificateIssuableMajorEvents({ take: 50 }))).map((majorEvent) => ({
          id: majorEvent.id,
          name: majorEvent.name,
          emoji: majorEvent.emoji,
          dateLabel: this.formatRange(majorEvent.startDate, majorEvent.endDate),
        }));
      default:
        return (await firstValueFrom(this.api.listCertificateFolders({ take: 50 }))).map((folder) => ({
          id: folder.id,
          name: folder.name,
          emoji: folder.emoji,
          dateLabel: `Criada em ${this.formatDate(folder.createdAt)}`,
        }));
    }
  }

  private withCurrentTarget(
    scope: CertificateScope,
    targets: CertificateCloneTargetOption[],
  ): CertificateCloneTargetOption[] {
    if (scope !== this.data.config.scope) {
      return targets;
    }

    const current = this.getCurrentTargetOption();
    if (!current || targets.some((target) => target.id === current.id)) {
      return targets;
    }

    return [current, ...targets];
  }

  private getCurrentTargetOption(): CertificateCloneTargetOption | null {
    const config = this.data.config;
    if (config.scope === 'EVENT' && config.event) {
      return {
        id: config.event.id,
        name: config.event.name,
        emoji: config.event.emoji,
        dateLabel: this.formatRange(config.event.startDate, config.event.endDate),
      };
    }

    if (config.scope === 'EVENT_GROUP' && config.eventGroup) {
      return {
        id: config.eventGroup.id,
        name: config.eventGroup.name,
        emoji: config.eventGroup.emoji,
        dateLabel: `Criado em ${this.formatDate(config.eventGroup.createdAt)}`,
      };
    }

    if (config.scope === 'MAJOR_EVENT' && config.majorEvent) {
      return {
        id: config.majorEvent.id,
        name: config.majorEvent.name,
        emoji: config.majorEvent.emoji,
        dateLabel: this.formatRange(config.majorEvent.startDate, config.majorEvent.endDate),
      };
    }

    if (config.scope === 'OTHER' && config.folder) {
      return {
        id: config.folder.id,
        name: config.folder.name,
        emoji: config.folder.emoji,
        dateLabel: `Criada em ${this.formatDate(config.folder.createdAt)}`,
      };
    }

    return null;
  }

  private getConfigTargetId(config: CertificateConfig): string | null {
    if (config.scope === 'EVENT') {
      return config.eventId ?? null;
    }

    if (config.scope === 'EVENT_GROUP') {
      return config.eventGroupId ?? null;
    }

    if (config.scope === 'MAJOR_EVENT') {
      return config.majorEventId ?? null;
    }

    if (config.scope === 'OTHER') {
      return config.folderId ?? null;
    }

    return null;
  }

  private formatRange(startDate: string, endDate: string): string {
    return `${this.formatDate(startDate)} - ${this.formatDate(endDate)}`;
  }

  private formatDate(value: string): string {
    return this.dateFormatter.format(new Date(value));
  }
}
