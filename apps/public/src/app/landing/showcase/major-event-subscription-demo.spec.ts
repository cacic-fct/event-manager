import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MajorEventSubscriptionDemoComponent } from './major-event-subscription-demo';

describe('MajorEventSubscriptionDemoComponent', () => {
  let fixture: ComponentFixture<MajorEventSubscriptionDemoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MajorEventSubscriptionDemoComponent] }).compileComponents();
    fixture = TestBed.createComponent(MajorEventSubscriptionDemoComponent);
    fixture.detectChanges();
  });

  it('requires a rendered activity selection before enabling review', () => {
    const reviewButton = buttonNamed('Revisar inscrição');
    expect(reviewButton.disabled).toBe(true);

    reviewButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('selection');
    expect(fixture.nativeElement.textContent).toContain('0 eventos selecionados');
  });

  it('reviews selected activities, confirms the registration, and can restart the demo', () => {
    checkboxFor('Interfaces que incluem').click();
    checkboxFor('Realidade Virtual').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('2 eventos selecionados');
    expect(fixture.componentInstance.durationLabel()).toBe('3h 30min');
    expect(buttonNamed('Revisar inscrição').disabled).toBe(false);

    buttonNamed('Revisar inscrição').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('review');
    expect(activityList('.review-activities')).toEqual(['Interfaces que incluem', 'Realidade Virtual']);

    buttonNamed('Confirmar inscrição').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('confirmed');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain(
      'Seu lugar está reservado.',
    );
    expect(activityList('.subscription-success ul')).toEqual(['Interfaces que incluem', 'Realidade Virtual']);

    buttonNamed('Recomeçar demonstração').click();
    fixture.detectChanges();

    expect(fixture.componentInstance.step()).toBe('selection');
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.activity-row strong') as NodeListOf<HTMLElement>, (item) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Interfaces que incluem', 'Realidade Virtual', 'Do protótipo ao mundo']);
    expect(checkboxFor('Interfaces que incluem').checked).toBe(true);
    expect(checkboxFor('Realidade Virtual').checked).toBe(true);
    expect(buttonNamed('Revisar inscrição').disabled).toBe(false);
  });

  function checkboxFor(activityName: string): HTMLInputElement {
    const row = Array.from(fixture.nativeElement.querySelectorAll('.activity-row') as NodeListOf<HTMLElement>).find(
      (candidate) => candidate.textContent?.includes(activityName),
    );
    const input = row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    if (!input) throw new Error(`Activity checkbox not found: ${activityName}`);
    return input;
  }

  function buttonNamed(label: string): HTMLButtonElement {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim().includes(label));
    if (!button) throw new Error(`Subscription demo button not found: ${label}`);
    return button;
  }

  function activityList(selector: string): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll(`${selector} li`) as NodeListOf<HTMLLIElement>, (item) =>
      item.querySelector('strong')?.textContent?.trim() ?? '',
    );
  }
});
