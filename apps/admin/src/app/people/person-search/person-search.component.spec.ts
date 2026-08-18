import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { PersonSearchComponent } from './person-search.component';

describe('PersonSearchComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PersonSearchComponent, NoopAnimationsModule] });
  });

  afterEach(() => vi.useRealTimers());

  it('searches while typing and keeps the explicit search button as a fallback', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(PersonSearchComponent);
    const searches: string[] = [];
    fixture.componentInstance.searchRequested.subscribe((query) => searches.push(query));
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(320);
    expect(searches).toEqual(['Ada']);

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    expect(searches).toEqual(['Ada', 'Ada']);
  });

  it('does not search or expose results without permission', () => {
    const fixture = TestBed.createComponent(PersonSearchComponent);
    fixture.componentRef.setInput('disabled', true);
    fixture.componentRef.setInput('results', [{ id: 'person-1', name: 'Ada' }] as never);
    fixture.detectChanges();

    expect((fixture.nativeElement.querySelector('input') as HTMLInputElement).disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('.person-search-result')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Buscar pessoas exige permissão');
  });

  it('keeps the static search icon visible while a search is loading', () => {
    const fixture = TestBed.createComponent(PersonSearchComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('query', 'Ada');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('mat-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-icon')?.textContent?.trim()).toBe('person_search');
    expect(fixture.nativeElement.querySelectorAll('mat-icon')[1]?.textContent?.trim()).toBe('search');
  });

  it('hides identity details and only shows the empty state after a completed search', () => {
    const fixture = TestBed.createComponent(PersonSearchComponent);
    fixture.componentRef.setInput('showIdentitySummary', false);
    fixture.componentRef.setInput('results', [{ id: 'person-1', name: 'Ada', identityDocument: '123.456.789-00' }] as never);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('123.456.789-00');

    fixture.componentRef.setInput('results', []);
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'Ada';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Nenhuma pessoa encontrada');

    (fixture.componentInstance as unknown as { searchNow(): void }).searchNow();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nenhuma pessoa encontrada para esta busca.');
  });
});
