import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PendingPermissionChangesService } from './pending-permission-changes.service';

@Component({
  selector: 'app-unsaved-changes-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (pending.dirty()) {
      <aside class="unsaved-bar" [class.unsaved-bar--blocked]="pending.blockedNavigation()">
        <span role="status"><mat-icon>edit_note</mat-icon><strong>Alterações não salvas</strong></span>
        <div>
          <button mat-button type="button" [disabled]="pending.saving()" (click)="pending.reset()">Redefinir</button>
          <button mat-flat-button type="button" [disabled]="pending.saving()" (click)="pending.save()"><mat-icon>save</mat-icon>{{ pending.saving() ? 'Salvando…' : 'Salvar alterações' }}</button>
        </div>
      </aside>
    }
  `,
  styles: `
    .unsaved-bar { position: fixed; z-index: 1100; inset-inline: max(1rem, calc((100vw - 72rem) / 2)); bottom: 1rem;
      display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem 1rem;
      color: var(--mat-sys-on-surface); background: var(--mat-sys-surface-container-high);
      border: 1px solid var(--mat-sys-outline-variant); border-radius: 12px;
      box-shadow: 0 8px 24px color-mix(in srgb, var(--mat-sys-shadow) 28%, transparent); }
    .unsaved-bar span, .unsaved-bar div { display: flex; align-items: center; gap: .5rem; }
    .unsaved-bar--blocked { color: var(--mat-sys-on-error-container); background: var(--mat-sys-error-container);
      animation: blocked 700ms cubic-bezier(.16, 1, .3, 1); }
    @keyframes blocked { 30% { transform: translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .unsaved-bar--blocked { animation: none; outline: 2px solid var(--mat-sys-error); } }
    @media (max-width: 600px) { .unsaved-bar { inset-inline: .5rem; bottom: .5rem; align-items: stretch; flex-direction: column; }
      .unsaved-bar div { justify-content: flex-end; } }
  `,
})
export class UnsavedChangesBarComponent {
  protected readonly pending = inject(PendingPermissionChangesService);
}
