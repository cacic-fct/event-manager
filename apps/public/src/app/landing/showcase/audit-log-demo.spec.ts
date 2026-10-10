import { registerLocaleData } from '@angular/common';
import pt from '@angular/common/locales/pt';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuditLogDemoComponent } from './audit-log-demo';

describe('AuditLogDemoComponent', () => {
  let fixture: ComponentFixture<AuditLogDemoComponent>;
  let component: AuditLogDemoComponent;

  beforeEach(async () => {
    registerLocaleData(pt, 'pt-BR');
    await TestBed.configureTestingModule({ imports: [AuditLogDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(AuditLogDemoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('filters records by actor, changed values, and category, then clears the filters', () => {
    const search = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'Marina';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.visibleRecords().map((record) => record.id)).toEqual(['event-edit', 'certificate-issue']);

    component.setCategory('certificate');
    fixture.detectChanges();
    expect(component.visibleRecords().map((record) => record.id)).toEqual(['certificate-issue']);

    search.value = 'M. Costa';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.visibleRecords().map((record) => record.id)).toEqual(['certificate-issue']);

    component.clearFilters();
    fixture.detectChanges();
    expect(component.visibleRecords()).toHaveLength(4);
    expect(component.recordCountLabel()).toBe('4 registros');
  });

  it('opens a field-by-field change detail and returns to the filtered record list', () => {
    component.setCategory('event');
    fixture.detectChanges();

    const recordButton = fixture.nativeElement.querySelector('[data-record-id="event-edit"]') as HTMLButtonElement;
    recordButton.click();
    fixture.detectChanges();

    expect(component.selectedRecord()?.summary).toBe('Evento atualizado pelo painel administrativo.');
    expect(component.actorInitials(component.selectedRecord()?.actorName ?? '')).toBe('MC');
    expect(fixture.nativeElement.textContent).toContain('Vagas');
    expect(fixture.nativeElement.textContent).toContain('40');
    expect(fixture.nativeElement.textContent).toContain('60');
    expect(fixture.nativeElement.textContent).toContain('Antes');
    expect(fixture.nativeElement.textContent).toContain('Depois');

    const backButton = fixture.nativeElement.querySelector('.audit-back') as HTMLButtonElement;
    backButton.click();
    fixture.detectChanges();

    expect(component.selectedRecord()).toBeNull();
    expect(component.visibleRecords().map((record) => record.id)).toEqual(['event-edit']);
  });
});
