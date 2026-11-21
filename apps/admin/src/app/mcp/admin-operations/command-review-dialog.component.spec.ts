import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommandReviewDialogComponent } from './command-review-dialog.component';
import { buildCommandArguments, type CommandArgument } from './command-arguments';
import { sportsCommand } from './admin-operations.fixtures';

describe('CommandReviewDialogComponent', () => {
  function setup(overrides: Partial<CommandArgument> = {}) {
    const command = sportsCommand();
    const field = { ...buildCommandArguments(command)[1], ...overrides };
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { field, targets: command.targets } },
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
  it('offers searchable named destinations and preserves selection across search queries', async () => {
    const { component, fixture, close } = setup({
      key: 'teamIds',
      label: 'Equipes',
      original: ['equipe-demo', 'other'],
      value: ['equipe-demo', 'other'],
    });
    component.search.setValue('azul');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.filteredOptions()).toEqual(['equipe-demo']);
    expect(fixture.nativeElement.textContent).toContain('Equipe Azul');
    component.toggle('equipe-demo', false);
    component.search.setValue('other');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.filteredOptions()).toEqual(['other']);
    component.save();
    expect(close).toHaveBeenCalledWith({ value: ['other'] });
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
  it('round-trips dates in local time without changing the instant', () => {
    const value = new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z');
    const { component, close } = setup({ value, schema: { format: 'date-time' } });
    component.save();
    expect(close).toHaveBeenCalledWith({ value });
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
