import { within } from '@testing-library/dom';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WorkspaceRecordComponent } from './workspace-record.component';
import { Router, provideRouter } from '@angular/router';

@Component({
  imports: [WorkspaceRecordComponent],
  template: `<app-workspace-record
    title="Evento A"
    [label]="label()"
    [readonly]="readonly"
    [disabled]="disabled"
    [link]="link"
    [queryParams]="{ eventId: 'evento com espaço' }"
    [selected]="true"
    (activate)="selections = selections + 1"
    ><span recordDescription>Descrição do evento</span
    ><button recordActions type="button" (click)="secondary = secondary + 1">Histórico</button></app-workspace-record
  >`,
})
class RecordHost {
  label = signal('');
  disabled = false;
  readonly = false;
  selections = 0;
  secondary = 0;
  link: string[] | null = null;
}

describe('WorkspaceRecordComponent', () => {
  it('exposes an encoded native link and leaves modified clicks to the browser', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(RecordHost);
    fixture.componentInstance.link = ['/forms', 'form/with space'];
    await fixture.whenStable();
    const link = within(fixture.nativeElement).getByRole('link', {
      name: 'Evento A',
      description: 'Descrição do evento',
    }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/forms/form%2Fwith%20space?eventId=evento%20com%20espa%C3%A7o');
    expect(link.getAttribute('aria-current')).toBe('page');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
    link.click();
    expect(navigate).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.selections).toBe(0);
    within(fixture.nativeElement).getByRole('button', { name: 'Histórico' }).click();
    expect(navigate).toHaveBeenCalledOnce();
    fixture.componentInstance.disabled = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    link.click();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('renders a read-only record without an interactive main control', async () => {
    const fixture = TestBed.createComponent(RecordHost);
    fixture.componentInstance.readonly = true;
    await fixture.whenStable();
    const canvas = within(fixture.nativeElement);
    expect(canvas.queryByRole('link', { name: 'Evento A' })).toBeNull();
    expect(canvas.queryByRole('button', { name: 'Evento A' })).toBeNull();
    expect(canvas.getByText('Evento A')).toBeTruthy();
    expect(canvas.getByText('Descrição do evento')).toBeTruthy();
    within(fixture.nativeElement).getByRole('button', { name: 'Histórico' }).click();
    expect(fixture.componentInstance.secondary).toBe(1);
    expect(fixture.componentInstance.selections).toBe(0);
  });

  it('keeps the record selection and secondary action independent', async () => {
    const fixture = TestBed.createComponent(RecordHost);
    await fixture.whenStable();
    const canvas = within(fixture.nativeElement);
    const mainButton = canvas.getByRole('button', { name: 'Evento A', description: 'Descrição do evento' });
    const historyButton = canvas.getByRole('button', { name: 'Histórico' });
    const ancestorClick = vi.fn();
    fixture.nativeElement.addEventListener('click', ancestorClick);
    historyButton.click();
    expect(ancestorClick).not.toHaveBeenCalled();
    expect(fixture.componentInstance.secondary).toBe(1);
    expect(fixture.componentInstance.selections).toBe(0);
    mainButton.click();
    expect(fixture.componentInstance.selections).toBe(1);
    fixture.componentInstance.disabled = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    mainButton.click();
    expect(fixture.componentInstance.selections).toBe(1);
  });
  it('keeps a custom action name concise and updates the action independently', async () => {
    const fixture = TestBed.createComponent(RecordHost);
    fixture.componentInstance.label.set('Selecionar Evento A');
    await fixture.whenStable();
    const canvas = within(fixture.nativeElement);
    expect(
      canvas.getByRole('button', {
        name: 'Selecionar Evento A',
        description: 'Descrição do evento',
      }),
    ).toBeTruthy();
    fixture.componentInstance.label.set('Abrir Evento A');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(
      canvas.getByRole('button', {
        name: 'Abrir Evento A',
        description: 'Descrição do evento',
      }),
    ).toBeTruthy();
  });
});
