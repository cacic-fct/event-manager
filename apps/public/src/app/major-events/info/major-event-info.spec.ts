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

  it('preserves an explicit all-days selection as more activities load', () => {
    const { fixture, today, tomorrow } = setup(Date.parse(publicFixtureDateFromNow()));
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    const allDays = buttons.find((button) => button.textContent?.includes('Todos os dias'));
    expect(allDays).toBeDefined();
    allDays?.click();
    fixture.detectChanges();
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
