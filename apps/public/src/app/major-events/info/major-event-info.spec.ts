import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  createPublicEvent,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';
import { MajorEventInfo } from './major-event-info';

it('emits login and program recovery actions without navigating or submitting a registration', () => {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  const fixture = TestBed.createComponent(MajorEventInfo);
  const login = vi.fn();
  const retry = vi.fn();
  fixture.componentRef.setInput('majorEvent', createPublicMajorEvent());
  fixture.componentRef.setInput('registration', {
    title: 'Participe',
    action: { label: 'Entrar para inscrever-se', login: true },
  });
  fixture.componentRef.setInput('programError', true);
  fixture.componentInstance.loginRequested.subscribe(login);
  fixture.componentInstance.retryProgram.subscribe(retry);
  fixture.detectChanges();
  const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  buttons.find((button) => button.textContent?.includes('Entrar para inscrever-se'))?.click();
  buttons.find((button) => button.textContent?.includes('Tentar novamente'))?.click();
  expect(login).toHaveBeenCalledOnce();
  expect(retry).toHaveBeenCalledOnce();
});

describe('major-event program date navigation', () => {
  function setup(now: number) {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
    const fixture = TestBed.createComponent(MajorEventInfo);
    const today = createPublicEvent({ id: 'today', name: 'Atividade de hoje', startDate: publicFixtureDateFromNow() });
    const tomorrow = createPublicEvent({
      id: 'tomorrow',
      name: 'Atividade de amanhã',
      startDate: publicFixtureDateFromNow(1),
    });
    fixture.componentRef.setInput('majorEvent', createPublicMajorEvent());
    fixture.componentRef.setInput('registration', { title: 'Participação' });
    fixture.componentRef.setInput('events', [today, tomorrow]);
    fixture.componentRef.setInput('now', now);
    fixture.detectChanges();
    return { fixture, today, tomorrow };
  }

  it('starts on today when today has activities', () => {
    const { fixture } = setup(Date.parse(publicFixtureDateFromNow()));
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Atividade de hoje');
    expect(text).not.toContain('Atividade de amanhã');
  });

  it('starts on all days when today has no activities', () => {
    const { fixture } = setup(Date.parse(publicFixtureDateFromNow(-2)));
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Atividade de hoje');
    expect(text).toContain('Atividade de amanhã');
  });

  it('advances the automatic day when the local date changes', () => {
    const { fixture, tomorrow } = setup(Date.parse(publicFixtureDateFromNow()));
    fixture.componentRef.setInput('now', Date.parse(tomorrow.startDate));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).not.toContain('Atividade de hoje');
    expect(text).toContain('Atividade de amanhã');
  });

  it('preserves a manually selected day when the local date changes', () => {
    const { fixture } = setup(Date.parse(publicFixtureDateFromNow()));
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.program mat-button-toggle button'),
    );
    expect(buttons).toHaveLength(3);
    buttons[2].click();
    fixture.detectChanges();

    fixture.componentRef.setInput('now', Date.parse(publicFixtureDateFromNow(2)));
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).not.toContain('Atividade de hoje');
    expect(text).toContain('Atividade de amanhã');
  });

  it('preserves an explicit all-days selection as more activities load and the local date changes', () => {
    const { fixture, today, tomorrow } = setup(Date.parse(publicFixtureDateFromNow()));
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const allDays = buttons.find((button) => button.textContent?.includes('Todos os dias'));
    expect(allDays).toBeDefined();
    allDays?.click();
    fixture.detectChanges();
    fixture.componentRef.setInput('now', Date.parse(tomorrow.startDate));
    fixture.componentRef.setInput('events', [
      today,
      tomorrow,
      createPublicEvent({ id: 'later', name: 'Nova atividade', startDate: publicFixtureDateFromNow(2) }),
    ]);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Atividade de hoje');
    expect(text).toContain('Atividade de amanhã');
    expect(text).toContain('Nova atividade');
  });
});

it('keeps one progress bar and hides the registration period after it closes', () => {
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient()] });
  const fixture = TestBed.createComponent(MajorEventInfo);
  fixture.componentRef.setInput(
    'majorEvent',
    createPublicMajorEvent({
      endDate: publicFixtureDateFromNow(5),
      subscriptionStartDate: publicFixtureDateFromNow(-2),
      subscriptionEndDate: publicFixtureDateFromNow(-1),
    }),
  );
  fixture.componentRef.setInput('registration', { title: 'Inscrições encerradas' });
  fixture.componentRef.setInput('backUrl', '/profile/attendances?tab=upcoming#events');
  fixture.componentRef.setInput('programLoading', true);
  fixture.componentRef.setInput('participationLoading', true);
  fixture.detectChanges();

  const host = fixture.nativeElement as HTMLElement;
  const backLink = host.querySelector('mat-toolbar a[aria-label="Voltar para minhas participações"]');
  expect(backLink?.getAttribute('href')).toBe('/profile/attendances?tab=upcoming#events');
  expect(backLink?.textContent?.trim()).toBe('arrow_back');
  expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  expect(host.textContent).not.toContain('Período de inscrições');
});
