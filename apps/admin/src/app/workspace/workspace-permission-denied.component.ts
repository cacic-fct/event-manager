import { Component, ChangeDetectionStrategy, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { WorkspacePermissionsService } from '../shared/services/workspace-permissions.service';
import { WorkspaceNavLinkItem } from './workspace-nav';

@Component({
  selector: 'app-workspace-permission-denied',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="permission-denied">
      <mat-icon>lock</mat-icon>

      <h2>Seção indisponível</h2>

      <p>
        @if (requiredRoleLabel(); as roleLabel) {
          É necessário acessar como <strong>{{ roleLabel }}</strong> para abrir
        } @else {
          Faltam permissões de leitura para abrir
        }
        <strong>{{ navItem().label }}</strong
        >.
      </p>

      @if (missingPermissions().length > 0) {
        <div class="permission-list" aria-label="Permissões ausentes">
          @for (scope of missingPermissions(); track scope) {
            <span class="permission-chip">{{ scope }}</span>
          }
        </div>
      }
    </section>
  `,
  styles: `
    .permission-denied {
      display: grid;
      place-items: center;
      gap: 0.75rem;

      min-height: 18rem;
      padding: 2rem;
      text-align: center;
    }

    mat-icon {
      width: 3rem;
      height: 3rem;
      font-size: 3rem;
      color: var(--mat-sys-error);
    }

    h2,
    p {
      margin: 0;
    }

    p {
      color: var(--mat-sys-on-surface-variant);
    }

    .permission-list {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem;

      margin-top: 0.5rem;
    }

    .permission-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;

      min-height: 1.75rem;
      padding: 0 0.625rem;
      border-radius: 999px;

      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);

      font-size: 0.8125rem;
      font-weight: 600;
    }
  `,
})
export class WorkspacePermissionDeniedComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(WorkspacePermissionsService);

  protected readonly navItem = computed(() => {
    return this.route.snapshot.data as WorkspaceNavLinkItem;
  });

  protected readonly missingPermissions = computed(() => {
    return this.permissions.missingReadForTab(this.navItem().id);
  });

  protected readonly requiredRoleLabel = computed(() => {
    const navItem = this.navItem();
    return 'requiredRoleLabel' in navItem ? navItem.requiredRoleLabel : undefined;
  });
}
