import { TestBed } from '@angular/core/testing';
import { SPORTS_FORMAT_OPTIONS, SportsFormatGuideComponent } from './sports-format-guide.component';

describe('SportsFormatGuideComponent', () => {
  it('offers every supported format with localized labels', () => {
    expect(SPORTS_FORMAT_OPTIONS.map((option) => option.value)).toEqual([
      'SINGLE_ELIMINATION',
      'ROUND_ROBIN',
      'GROUP_STAGE_ELIMINATION',
      'DOUBLE_ELIMINATION',
      'SWISS',
      'CUSTOM',
    ]);
    expect(SPORTS_FORMAT_OPTIONS.every((option) => option.label.length > 0 && option.description.length > 0)).toBe(
      true,
    );
  });

  it.each(SPORTS_FORMAT_OPTIONS)('renders and selects $value', async ({ value, label }) => {
    const fixture = TestBed.createComponent(SportsFormatGuideComponent);
    const selected = vi.fn();
    fixture.componentRef.setInput('currentFormat', value);
    fixture.componentInstance.formatSelected.subscribe(selected);
    fixture.detectChanges();
    await fixture.whenStable();

    const selectedButton = fixture.nativeElement.querySelector('button.selected') as HTMLButtonElement | null;
    expect(selectedButton?.textContent).toContain(label);
    expect(fixture.nativeElement.querySelector('.dummy-bracket')?.getAttribute('data-format')).toBe(value);

    selectedButton?.click();
    expect(selected).toHaveBeenCalledWith(value);
  });
});
