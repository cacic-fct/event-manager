import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { AdminMcpCommand } from '@cacic-fct/event-manager-mcp-contracts';
import { CommandReviewDialogComponent } from './command-review-dialog.component';
import { buildCommandArguments, type CommandArgument } from './command-arguments';
import { sportsCommand } from './admin-operations.fixtures';

describe('CommandReviewDialogComponent', () => {
  function setup(overrides: Partial<CommandArgument> = {}, targets?: AdminMcpCommand['targets']) {
    const command = sportsCommand();
    const field = { ...buildCommandArguments(command)[1], ...overrides };
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { field, targets: targets ?? command.targets } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const fixture = TestBed.createComponent(CommandReviewDialogComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture, close, field };
  }
  it('uses a numeric editor and returns only a draft without executing an operation', () => {
    const { component, fixture, close, field } = setup();
    expect(fixture.nativeElement.querySelector('input[type="number"]')).not.toBeNull();
    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement;
    input.value = '7';
    input.dispatchEvent(new Event('input'));
    expect(component.control.value).toBe(7);
    component.save();
    expect(close).toHaveBeenCalledWith({ value: 7 });
    expect(field.value).toBe(2);
  });
  it.each(['eventIds', 'ids'])('allows searching and narrowing event destinations for %s', async (key) => {
    const { component, fixture, close } = setup(
      { key, label: 'Eventos', original: ['oficina', 'seminario'], value: ['oficina', 'seminario'] },
      [
        { kind: 'Event', id: 'oficina', label: 'Oficina de Ciência de Dados' },
        { kind: 'Event', id: 'seminario', label: 'Seminário de Matemática' },
      ],
    );
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    component.search.setValue('ciencia');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.filteredOptions()).toEqual(['oficina']);
    expect(fixture.nativeElement.textContent).toContain('Oficina de Ciência de Dados');
    component.toggle('oficina', false);
    component.search.setValue('matematica');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.filteredOptions()).toEqual(['seminario']);
    component.save();
    expect(close).toHaveBeenCalledWith({ value: ['seminario'] });
  });
  it('uses a select for enumerated values and checkbox for boolean values', () => {
    const { component, fixture, close } = setup({ value: 'DRAFT', schema: { enum: ['DRAFT', 'PUBLISHED'] } });
    expect(fixture.nativeElement.querySelector('mat-select')).not.toBeNull();
    component.control.setValue('PUBLISHED');
    component.save();
    expect(close).toHaveBeenCalledWith({ value: 'PUBLISHED' });
  });
  it('uses a checkbox for boolean values', () => {
    const { component, fixture, close } = setup({ value: false, schema: { type: 'boolean' } });
    expect(fixture.nativeElement.querySelector('mat-checkbox')).not.toBeNull();
    component.booleanValue.set(true);
    component.save();
    expect(close).toHaveBeenCalledWith({ value: true });
  });
  it.each(['.000Z', '.123Z'])('round-trips dates with precision %s', (precision) => {
    const value = new Date().toISOString().replace(/\.\d{3}Z$/, precision);
    const { component, close } = setup({ value, schema: { format: 'date-time' } });
    component.save();
    expect(close).toHaveBeenCalledWith({ value });
  });
  it('preserves null when saved unchanged and allows an edited text value', () => {
    const { component, close } = setup({ key: 'notes', value: null, schema: { type: 'string' } });
    component.save();
    expect(close).toHaveBeenLastCalledWith({ value: null });
    component.keepNull.set(false);
    component.control.setValue('Observação');
    component.save();
    expect(close).toHaveBeenLastCalledWith({ value: 'Observação' });
  });
  it('keeps invalid structured input open and cannot edit a locked target', () => {
    const { component, fixture, close } = setup({ value: ['text'], schema: { type: 'array' } });
    component.control.setValue('{');
    component.save();
    fixture.detectChanges();
    expect(close).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    component.field.locked = true;
    component.control.setValue('[]');
    component.save();
    expect(close).not.toHaveBeenCalled();
  });
});
