import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, inject, input, linkedSignal, viewChild } from '@angular/core';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { MatExpansionModule, MatExpansionPanelHeader } from '@angular/material/expansion';

/** Keeps the selected context visible while putting the inventory away. */
@Component({
  selector: 'app-workspace-scope',
  imports: [MatExpansionModule, TwemojiComponent],
  template: `
    <mat-expansion-panel
      class="scope-panel"
      [expanded]="expanded()"
      [disabled]="disabled()"
      (opened)="expanded.set(true)"
      (closed)="expanded.set(false)"
      (afterCollapse)="restorePickerFocus()">
      <mat-expansion-panel-header>
        <mat-panel-title>@if (emoji(); as icon) { <lib-twemoji [emoji]="icon" /> }{{ title() || emptyLabel() }}</mat-panel-title>
        <mat-panel-description>{{ expanded() ? 'Fechar seleção' : changeLabel() }}</mat-panel-description>
      </mat-expansion-panel-header>
      @if (description()) {
        <p class="scope-description">{{ description() }}</p>
      }
      <div #picker><ng-content /></div>
    </mat-expansion-panel>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .scope-panel.mat-expansion-panel { box-shadow: none; border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface); }
    mat-expansion-panel-header { height: auto; min-height: 64px; padding-block: 0.5rem; box-sizing: border-box; }
    mat-panel-title { gap: 0.5rem; flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; font: var(--mat-sys-title-small); }
    mat-panel-description { flex: 0 0 auto; margin-inline-end: 0.75rem; font: var(--mat-sys-label-large); }
    .scope-description { margin: 0 0 1rem; color: var(--mat-sys-on-surface-variant); }
    @media (max-width: 480px) { mat-panel-description { display: none; } }
  `,
})
export class WorkspaceScopeComponent {
  private readonly document = inject(DOCUMENT);
  private readonly picker = viewChild<ElementRef<HTMLElement>>('picker');
  private readonly header = viewChild(MatExpansionPanelHeader);
  readonly scopeId = input<string | null>(null);
  readonly title = input('');
  readonly emoji = input<string | null | undefined>(null);
  readonly emptyLabel = input('Selecionar contexto');
  readonly changeLabel = input('Trocar contexto');
  readonly description = input('');
  readonly disabled = input(false);
  protected readonly expanded = linkedSignal(() => !this.scopeId() && !this.title());

  protected restorePickerFocus(): void {
    if (this.picker()?.nativeElement.contains(this.document.activeElement)) this.header()?.focus();
  }
}
