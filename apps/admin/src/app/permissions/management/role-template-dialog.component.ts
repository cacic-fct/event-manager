import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { EVENT_MANAGER_ROLE_TEMPLATES } from '@cacic-fct/shared-permissions';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-role-template-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, TwemojiComponent],
  template: `
    <h2 mat-dialog-title>Novo cargo</h2>
    <mat-dialog-content>
      <p>Comece em branco ou use um modelo. Você poderá revisar tudo antes de salvar.</p>
      <div class="template-list">
        <button mat-stroked-button [mat-dialog-close]="null">
          <mat-icon>add</mat-icon
          ><span><strong>Em branco</strong><small>Defina permissões e escopos do zero.</small></span>
        </button>
        @for (template of templates; track template.id) {
          <button mat-stroked-button [mat-dialog-close]="template">
            <lib-twemoji [emoji]="template.emoji" />
            <span
              ><strong>{{ template.name }}</strong
              ><small>{{ template.description }}</small></span
            >
          </button>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-button mat-dialog-close>Fechar</button></mat-dialog-actions>
  `,
  styles: `
    .template-list {
      display: grid;
      gap: 0.5rem;
      min-width: min(38rem, 75vw);
    }
    .template-list button {
      min-height: 4.25rem;
      justify-content: flex-start;
      text-align: left;
      white-space: normal;
    }
    .template-list span {
      display: grid;
      margin-left: 0.5rem;
    }
    .template-list small {
      color: var(--mat-sys-on-surface-variant);
    }
    @media (max-width: 600px) {
      .template-list {
        min-width: 0;
      }
    }
  `,
})
export class RoleTemplateDialogComponent {
  protected readonly templates = EVENT_MANAGER_ROLE_TEMPLATES;
}
