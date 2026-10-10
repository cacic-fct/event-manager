import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RegistrationDemoComponent } from './registration-demo';

describe('RegistrationDemoComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistrationDemoComponent],
      providers: [provideNoopAnimations()],
    }).compileComponents();
  });

  it('uses the major event subscription workflow for participants', () => {
    const fixture = createFixture(false);

    expect(fixture.nativeElement.querySelector('app-landing-major-event-subscription-demo')).not.toBeNull();
  });

  it('saves event name and location changes in local workspace state', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    expect(buttonNamed(fixture, 'Salvar alterações').disabled).toBe(true);
    clickButton(fixture, 'Selecionar evento Realidade Virtual');
    expect(component.eventDetailsModel()).toEqual({
      name: 'Realidade Virtual',
      locationDescription: 'Auditório',
    });

    const fields = Array.from(
      fixture.nativeElement.querySelectorAll('.event-form input') as NodeListOf<HTMLInputElement>,
    );
    setInputValue(fixture, fields[0], 'Realidade Virtual imersiva');
    setInputValue(fixture, fields[1], 'Auditório');
    expect(buttonNamed(fixture, 'Salvar alterações').disabled).toBe(false);
    clickButton(fixture, 'Salvar alterações');

    expect(component.selectedEvent()).toMatchObject({
      id: 'creating-with-ai',
      name: 'Realidade Virtual imersiva',
      locationDescription: 'Auditório',
    });
    expect(component.hasUnsavedEventChanges()).toBe(false);
    expect(component.eventSaved()).toBe(true);
    expect(text(fixture)).toContain('Alterações salvas.');
    expect(fixture.nativeElement.querySelector('#registration-demo-event-title')?.textContent).toContain(
      'Realidade Virtual imersiva',
    );
    expect(buttonNamed(fixture, 'Selecionar evento Realidade Virtual imersiva').getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('filters rendered subscription rows and clears the search when another event is selected', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    clickTab(fixture, 'Inscrições');
    expect(subscriptionRows(fixture)).toEqual([
      'Marina Costa',
      'Rafael Almeida',
      'Beatriz Lima',
    ]);

    const search = fixture.nativeElement.querySelector('.subscription-search input') as HTMLInputElement;
    setInputValue(fixture, search, 'Beatriz');

    expect(subscriptionRows(fixture)).toEqual(['Beatriz Lima']);
    expect(text(fixture)).toContain('Conflito de horário');
    expect(text(fixture)).not.toContain('Marina Costa');

    clickTab(fixture, 'Eventos');
    clickButton(fixture, 'Selecionar evento Realidade Virtual');
    expect(buttonNamed(fixture, 'Selecionar evento Realidade Virtual').getAttribute('aria-pressed')).toBe('true');

    clickTab(fixture, 'Inscrições');
    const clearedSearch = fixture.nativeElement.querySelector('.subscription-search input') as HTMLInputElement;
    expect(clearedSearch.value).toBe('');
    expect(component.subscriptionSearchModel().query).toBe('');
    expect(subscriptionRows(fixture)).toEqual([
      'Joana Martins',
      'Pedro Oliveira',
      'Ana Clara Silva',
    ]);
    expect(fixture.nativeElement.querySelector('table caption')?.textContent).toContain('Realidade Virtual');
  });
});

function createFixture(organizer = true): ComponentFixture<RegistrationDemoComponent> {
  const fixture = TestBed.createComponent(RegistrationDemoComponent);
  fixture.componentRef.setInput('organizer', organizer);
  fixture.detectChanges();
  return fixture;
}

function buttonNamed(fixture: ComponentFixture<RegistrationDemoComponent>, name: string): HTMLButtonElement {
  const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
    (candidate) =>
      candidate.getAttribute('aria-label') === name || candidate.textContent?.replace(/\s+/g, ' ').trim().includes(name),
  );
  if (!button) {
    throw new Error(`Button not found: ${name}`);
  }

  return button;
}

function clickButton(fixture: ComponentFixture<RegistrationDemoComponent>, name: string): void {
  const button = buttonNamed(fixture, name);
  button.click();
  fixture.detectChanges();
}

function clickTab(fixture: ComponentFixture<RegistrationDemoComponent>, name: string): void {
  const tab = Array.from(fixture.nativeElement.querySelectorAll('[role="tab"]') as NodeListOf<HTMLElement>).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === name,
  );
  if (!tab) {
    throw new Error(`Tab not found: ${name}`);
  }

  tab.click();
  fixture.detectChanges();
}

function setInputValue(
  fixture: ComponentFixture<RegistrationDemoComponent>,
  inputElement: HTMLInputElement | undefined,
  value: string,
): void {
  if (!inputElement) {
    throw new Error('Input not found.');
  }

  inputElement.value = value;
  inputElement.dispatchEvent(new Event('input', { bubbles: true }));
  fixture.detectChanges();
}

function text(fixture: ComponentFixture<RegistrationDemoComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function subscriptionRows(fixture: ComponentFixture<RegistrationDemoComponent>): string[] {
  return Array.from(fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>, (row) =>
    row.querySelector('td')?.textContent?.trim() ?? '',
  );
}
