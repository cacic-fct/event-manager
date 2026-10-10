import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { OrganizerShowcaseComponent } from './organizer-showcase';
import { ParticipantShowcaseComponent } from './participant-showcase';

describe('landing showcase integration', () => {
  afterEach(() => {
    delete document.documentElement.dataset['storybookMotion'];
  });

  it('passes a participant action into the event information demo and updates the shared stage', async () => {
    document.documentElement.dataset['storybookMotion'] = 'reduced';
    await TestBed.configureTestingModule({
      imports: [ParticipantShowcaseComponent],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(ParticipantShowcaseComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-landing-showcase-stage h3')?.textContent).toContain('Seu dia, já organizado.');

    clickButtonContaining(element, 'Ver no mapa');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectedFeature(element, 'Eventos e inscrições')).toBe(true);
    expect(element.querySelector('app-landing-showcase-stage h3')?.textContent).toContain('Eventos em poucos cliques.');
    expect(element.querySelector('app-landing-major-event-subscription-demo')).not.toBeNull();
    expect(element.querySelector('.event-info h4')?.textContent).toBe('Interfaces que incluem');
    expect(element.textContent).toContain('Carregando mapa.');
  });

  it('routes a dashboard action into the organizer attendance stage', async () => {
    document.documentElement.dataset['storybookMotion'] = 'reduced';
    await TestBed.configureTestingModule({
      imports: [OrganizerShowcaseComponent],
      providers: [provideNoopAnimations(), provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(OrganizerShowcaseComponent);
    await fixture.whenStable();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('app-landing-dashboard-demo')).not.toBeNull();
    expect(element.querySelector('app-landing-showcase-stage h3')?.textContent).toContain('Veja o que precisa de atenção.');
    expect(selectedFeature(element, 'Painel inteligente')).toBe(true);

    clickButtonContaining(element, 'Interfaces que incluem');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(selectedFeature(element, 'Presenças')).toBe(true);
    expect(element.querySelector('app-landing-showcase-stage h3')?.textContent).toContain('Um gesto, uma presença.');
    expect(element.querySelector('app-landing-attendance-demo')).not.toBeNull();
    expect(element.querySelector('app-landing-dashboard-demo')).toBeNull();
  });
});

function clickButtonContaining(element: HTMLElement, label: string): void {
  const button = [...element.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.replace(/\s+/g, ' ').includes(label),
  );

  if (!button) {
    throw new Error(`Could not find a button containing "${label}".`);
  }

  button.click();
}

function selectedFeature(element: HTMLElement, label: string): boolean {
  return [...element.querySelectorAll<HTMLButtonElement>('.feature-picker button')].some(
    (button) => button.textContent?.replace(/\s+/g, ' ').includes(label) && button.getAttribute('aria-pressed') === 'true',
  );
}
