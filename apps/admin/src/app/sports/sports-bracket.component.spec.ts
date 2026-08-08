import { TestBed } from '@angular/core/testing';
import {
  SPORTS_BRACKET_FIXTURES,
  SportsBracketComponent,
} from '@cacic-fct/shared-angular';

describe('SportsBracketComponent', () => {
  it('groups elimination matches into readable rounds', async () => {
    const fixture = TestBed.createComponent(SportsBracketComponent);
    fixture.componentRef.setInput('format', 'SINGLE_ELIMINATION');
    fixture.componentRef.setInput(
      'stages',
      SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION.stages,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Quartas de final');
    expect(fixture.nativeElement.textContent).toContain('Semifinais');
    expect(fixture.nativeElement.textContent).toContain('Final');
  });

  it('renders standings for non-elimination formats', async () => {
    const fixture = TestBed.createComponent(SportsBracketComponent);
    fixture.componentRef.setInput('format', 'SWISS');
    fixture.componentRef.setInput('stages', SPORTS_BRACKET_FIXTURES.SWISS.stages);
    fixture.componentRef.setInput(
      'standings',
      SPORTS_BRACKET_FIXTURES.SWISS.standings,
    );
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('table')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Sistema suíço');
  });
});
