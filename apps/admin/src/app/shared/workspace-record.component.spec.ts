import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WorkspaceRecordComponent } from './workspace-record.component';
import { Router, provideRouter } from '@angular/router';

@Component({
  imports: [WorkspaceRecordComponent],
  template: `<app-workspace-record title="Evento A" [disabled]="disabled" [link]="link" [queryParams]="{eventId: 'evento com espaço'}" [selected]="true" (activate)="selections = selections + 1"><span recordDescription>Descrição do evento</span><button recordActions type="button" (click)="secondary = secondary + 1">Histórico</button></app-workspace-record>`,
})
class RecordHost {
  disabled = false;
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
    const link = fixture.nativeElement.querySelector('a.record-main') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/forms/form%2Fwith%20space?eventId=evento%20com%20espa%C3%A7o');
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(link.textContent).toContain('Descrição do evento');
    expect(link.getAttribute('aria-describedby')).toBe(fixture.nativeElement.querySelector('.record-description').id);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    link.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
    expect(navigate).not.toHaveBeenCalled();
    link.click();
    expect(navigate).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.selections).toBe(0);
    (fixture.nativeElement.querySelector('[recordActions]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledOnce();
    fixture.componentInstance.disabled = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    link.click();
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('keeps the record selection and secondary action independent', async () => {
    const fixture = TestBed.createComponent(RecordHost);
    await fixture.whenStable();
    const mainButton = fixture.nativeElement.querySelector('button.record-main') as HTMLButtonElement;
    const description = fixture.nativeElement.querySelector('.record-description') as HTMLElement;
    expect(mainButton.getAttribute('aria-describedby')).toBe(description.id);
    expect(description.id).toMatch(/^workspace-record-description-/);
    const buttons: NodeListOf<HTMLButtonElement> = fixture.nativeElement.querySelectorAll('button');
    buttons[1].click();
    expect(fixture.componentInstance.secondary).toBe(1);
    expect(fixture.componentInstance.selections).toBe(0);
    buttons[0].click();
    expect(fixture.componentInstance.selections).toBe(1);
    fixture.componentInstance.disabled = true;
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();
    buttons[0].click();
    expect(fixture.componentInstance.selections).toBe(1);
  });
});
