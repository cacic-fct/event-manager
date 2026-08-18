import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { getPermissionResourceLabel, getPermissionScopeLabel, parsePermission, type PermissionContextDependency } from '@cacic-fct/shared-permissions';

@Component({
  selector: 'app-permission-dependency-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Este acesso depende de outras permissões</h2>
    <mat-dialog-content>
      <p>Revise a exposição adicional antes de continuar. Nada será salvo agora.</p>
      <ul>
        @for (dependency of data; track dependency.permission) {
          <li><strong>{{ label(dependency.permission) }}</strong> — {{ dependency.reason }}
            <span>Também adiciona: {{ dependency.requires.map(label).join(', ') }}</span></li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="true"><mat-icon>add_task</mat-icon>Adicionar dependências</button>
    </mat-dialog-actions>
  `,
  styles: `li { margin-block: .75rem; } li span { display: block; margin-top: .25rem; color: var(--mat-sys-on-surface-variant); }`,
})
export class PermissionDependencyDialogComponent {
  protected readonly data = inject<readonly PermissionContextDependency[]>(MAT_DIALOG_DATA);
  protected readonly label = (permission: string) => {
    const parsed = parsePermission(permission);
    return `${getPermissionResourceLabel(parsed.resource)} · ${getPermissionScopeLabel(parsed.scope)}`;
  };
}
