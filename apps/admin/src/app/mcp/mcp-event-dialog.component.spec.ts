import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { McpEventDialogComponent } from './mcp-event-dialog.component';

describe('McpEventDialogComponent', () => {
  it('keeps parent contexts open and returns only an individual event', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: MatDialogRef, useValue: { close } }] });
    const component = TestBed.runInInjectionContext(() => new McpEventDialogComponent());
    component.select({ kind: 'major-event', id: 'major' });
    expect(close).not.toHaveBeenCalled();
    expect(component.selectionError()).toContain('Selecione um evento');
    component.select({ kind: 'event', id: 'event' });
    expect(close).toHaveBeenCalledWith({ kind: 'event', id: 'event' });
  });
});
