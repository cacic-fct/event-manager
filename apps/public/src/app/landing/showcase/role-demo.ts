import { afterNextRender, Component, ElementRef, Injector, computed, inject, signal } from '@angular/core';
import { FormField, form, minLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

type RolePermissionId = 'subscriptions' | 'attendance' | 'receipts' | 'certificates';
type EditorMode = 'create' | 'edit' | 'summary';

interface RolePermissionChoice {
  id: RolePermissionId;
  label: string;
  description: string;
}

interface SavedRole {
  name: string;
  permissionIds: readonly RolePermissionId[];
}

const ROLE_PERMISSIONS: readonly RolePermissionChoice[] = [
  {
    id: 'subscriptions',
    label: 'Acompanhar inscrições',
    description: 'Consultar quem se inscreveu nas atividades.',
  },
  {
    id: 'attendance',
    label: 'Registrar presenças',
    description: 'Confirmar a chegada de participantes no evento.',
  },
  {
    id: 'receipts',
    label: 'Conferir comprovantes',
    description: 'Revisar comprovantes enviados pelos participantes.',
  },
  {
    id: 'certificates',
    label: 'Emitir certificados',
    description: 'Gerar certificados para quem participou.',
  },
];

@Component({
  selector: 'app-landing-role-demo',
  imports: [FormField, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './role-demo.html',
  styleUrl: './role-demo.scss',
})
export class RoleDemoComponent {
  readonly permissions = ROLE_PERMISSIONS;
  readonly mode = signal<EditorMode>('create');
  readonly draft = signal({ name: 'Equipe de credenciamento' });
  readonly selectedPermissionIds = signal<RolePermissionId[]>(['subscriptions', 'attendance']);
  readonly roleForm = form(this.draft, (schema) => {
    required(schema.name);
    minLength(schema.name, 3);
  });
  readonly savedRole = signal<SavedRole | null>(null);
  readonly lastSaveAction = signal<'created' | 'updated'>('created');
  readonly canSave = computed(
    () =>
      !this.roleForm().invalid() &&
      this.draft().name.trim().length >= 3 &&
      this.selectedPermissionIds().length > 0,
  );
  readonly saveButtonLabel = computed(() => (this.mode() === 'edit' ? 'Salvar alterações' : 'Criar cargo'));
  readonly savedPermissionChoices = computed(() => {
    const role = this.savedRole();
    if (!role) {
      return [];
    }

    return ROLE_PERMISSIONS.filter((permission) => role.permissionIds.includes(permission.id));
  });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  isSelected(permissionId: RolePermissionId): boolean {
    return this.selectedPermissionIds().includes(permissionId);
  }

  togglePermission(permissionId: RolePermissionId, checked: boolean): void {
    this.selectedPermissionIds.update((selected) => {
      if (!checked) {
        return selected.filter((id) => id !== permissionId);
      }

      return selected.includes(permissionId) ? selected : [...selected, permissionId];
    });
  }

  saveRole(): void {
    if (!this.canSave()) {
      return;
    }

    const name = this.draft().name.trim();
    if (name.length < 3 || this.selectedPermissionIds().length === 0) {
      return;
    }

    const isUpdate = this.mode() === 'edit';
    this.savedRole.set({
      name,
      permissionIds: [...this.selectedPermissionIds()],
    });
    this.lastSaveAction.set(isUpdate ? 'updated' : 'created');
    this.mode.set('summary');
    this.focusAfterRender('#role-summary-title');
  }

  editRole(): void {
    const role = this.savedRole();
    if (!role) {
      return;
    }

    this.draft.set({ name: role.name });
    this.selectedPermissionIds.set([...role.permissionIds]);
    this.mode.set('edit');
    this.focusAfterRender('#role-name');
  }

  createAnotherRole(): void {
    this.draft.set({ name: '' });
    this.selectedPermissionIds.set([]);
    this.savedRole.set(null);
    this.mode.set('create');
    this.focusAfterRender('#role-name');
  }

  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true }),
      { injector: this.injector },
    );
  }
}
