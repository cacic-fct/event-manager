import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import { PermissionsService } from '../permissions/permissions.service';
import { NavigationLinkItem } from './navigation';

@Component({
  selector: 'app-workspace-permission-denied',
  standalone: true,
  imports: [MatIconModule],
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
  styleUrl: './permission-denied.component.scss',
})
export class PermissionDeniedComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly permissions = inject(PermissionsService);

  protected readonly navItem = computed(() => {
    return this.route.snapshot.data as NavigationLinkItem;
  });

  protected readonly missingPermissions = computed(() => {
    return this.permissions.missingReadForTab(this.navItem().id);
  });

  protected readonly requiredRoleLabel = computed(() => {
    const navItem = this.navItem();
    return 'requiredRoleLabel' in navItem ? navItem.requiredRoleLabel : undefined;
  });
}
