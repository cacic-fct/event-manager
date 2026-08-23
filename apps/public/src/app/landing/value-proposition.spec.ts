import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ValuePropositionComponent } from './value-proposition';

describe('ValuePropositionComponent', () => {
  let fixture: ComponentFixture<ValuePropositionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ValuePropositionComponent] }).compileComponents();

    fixture = TestBed.createComponent(ValuePropositionComponent);
  });

  it('announces loading statistics without applying a label to the decorative skeleton', () => {
    fixture.componentRef.setInput('statsState', 'loading');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const loadingStatus = element.querySelector('[role="status"]');
    const loadingSkeleton = element.querySelector('.value-proposition-stats-loading');

    expect(loadingStatus?.textContent).toContain('Carregando estatísticas da plataforma');
    expect(loadingSkeleton?.getAttribute('aria-label')).toBeNull();
    expect(loadingSkeleton?.getAttribute('aria-hidden')).toBe('true');
  });
});
