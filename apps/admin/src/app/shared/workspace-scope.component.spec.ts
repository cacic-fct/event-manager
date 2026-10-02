import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WorkspaceScopeComponent } from './workspace-scope.component';

@Component({
  imports: [WorkspaceScopeComponent],
  template: `<app-workspace-scope [scopeId]="scopeId()" [title]="title()"><input aria-label="Buscar evento" value="busca preservada" /></app-workspace-scope>`,
})
class ScopeHost {
  scopeId = signal<string | null>(null);
  title = signal('');
}

describe('WorkspaceScopeComponent', () => {
  it('treats an explicitly named global view as a selected context', async () => {
    const fixture = TestBed.createComponent(WorkspaceScopeComponent);
    fixture.componentRef.setInput('title', 'Todos os formulários');
    fixture.componentRef.setInput('emoji', '🧠');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('mat-expansion-panel-header').getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('lib-twemoji')).not.toBeNull();
  });

  it('starts with selection available, collapses a selected context, and preserves the picker while switching', async () => {
    const fixture = TestBed.createComponent(ScopeHost);
    await fixture.whenStable();
    const header = (): HTMLElement => fixture.nativeElement.querySelector('mat-expansion-panel-header');
    expect(header().getAttribute('aria-expanded')).toBe('true');
    fixture.componentInstance.scopeId.set('event-a');
    fixture.componentInstance.title.set('Evento A');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(header().textContent).toContain('Evento A');
    header().click();
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('input').value).toBe('busca preservada');
    fixture.componentInstance.scopeId.set('event-b');
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(header().getAttribute('aria-expanded')).toBe('false');
  });
});
