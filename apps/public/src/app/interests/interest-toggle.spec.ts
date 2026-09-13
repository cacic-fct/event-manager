import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { createPublicEventInterest, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import type { EventInterest } from '@cacic-fct/shared-event-participation';
import { Subject, of, throwError } from 'rxjs';
import { NetworkStatusService } from '../shared/network-status.service';
import { InterestApiService } from './interest-api.service';
import { InterestToggle } from './interest-toggle';

describe('InterestToggle', () => {
  it('hides implicit interest for subscribers without creating an interest record', async () => {
    const { fixture, api, snackBar } = await setup();
    fixture.componentRef.setInput('subscribed', true);
    await fixture.whenStable();
    fixture.componentInstance.toggle();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.hidden).toBe(true);
    expect(api.set).not.toHaveBeenCalled();
    expect(fixture.componentInstance.interested()).toBe(false);
    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('preserves historical interest and hides the control after the event finishes', async () => {
    const { fixture, api } = await setup();
    api.getState.mockReturnValue(of(interestState(createPublicEventInterest(), false, publicFixtureDateFromNow(-1))));
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.componentInstance.toggle();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(fixture.nativeElement.hidden).toBe(true);
    expect(fixture.componentInstance.interested()).toBe(true);
    expect(api.set).not.toHaveBeenCalled();
  });

  it('sets and clears interest independently, keeping the control mounted', async () => {
    const { fixture, api, snackBar } = await setup();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.focus();
    button.click();
    await fixture.whenStable();
    expect(api.set).toHaveBeenLastCalledWith('EVENT', 'event-1', true);
    expect(fixture.nativeElement.querySelector('button')).toBe(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(button);
    expect(snackBar.open).toHaveBeenCalledWith('Seu interesse foi registrado! A inscrição, quando necessária, é feita separadamente.', 'Fechar', { duration: 12_000 });

    api.set.mockReturnValue(of(null));
    button.click();
    await fixture.whenStable();
    expect(api.set).toHaveBeenLastCalledWith('EVENT', 'event-1', false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('prevents duplicate writes while a request is pending and keeps state on failure', async () => {
    const { fixture, api } = await setup();
    const pending = new Subject<EventInterest | null>();
    api.set.mockReturnValue(pending);
    fixture.componentInstance.toggle();
    fixture.componentInstance.toggle();
    expect(api.set).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.interested()).toBe(false);
    pending.error(new Error('Unavailable'));
    await fixture.whenStable();
    expect(fixture.componentInstance.saving()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Tente novamente');
    expect(fixture.componentInstance.interested()).toBe(false);
  });

  it('requires login without writing interest and blocks offline updates', async () => {
    const { fixture, api, auth, online } = await setup(false);
    fixture.componentInstance.toggle();
    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/' });
    expect(api.getState).not.toHaveBeenCalled();
    expect(api.set).not.toHaveBeenCalled();
    online.set(false);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('loads the next event independently when the route reuses a control', async () => {
    const { fixture, api } = await setup();
    fixture.componentRef.setInput('targetId', 'event-2');
    api.getState.mockReturnValue(of(interestState(createPublicEventInterest({ eventId: 'event-2' }))));
    await fixture.whenStable();
    expect(api.getState).toHaveBeenLastCalledWith('EVENT', 'event-2');
    expect(fixture.componentInstance.interested()).toBe(true);
  });

  it('offers a retry after a read failure without overwriting unknown interest', async () => {
    const { fixture, api } = await setup();
    api.getState.mockReturnValue(throwError(() => new Error('Offline')));
    fixture.componentInstance.retry();
    await fixture.whenStable();
    fixture.componentInstance.toggle();
    expect(api.set).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Tentar novamente');
    api.getState.mockReturnValue(of(interestState(createPublicEventInterest())));
    fixture.componentInstance.retry();
    await fixture.whenStable();
    expect(fixture.componentInstance.interested()).toBe(true);
  });
});

async function setup(authenticated = true) {
  const api = {
    getState: vi.fn(() => of(interestState(null))),
    set: vi.fn(() => of<EventInterest | null>(createPublicEventInterest())),
  };
  const auth = { isAuthenticated: signal(authenticated), login: vi.fn() };
  const snackBar = { open: vi.fn() };
  const online = signal(true);
  TestBed.configureTestingModule({
    imports: [InterestToggle],
    providers: [
      provideRouter([]),
      { provide: InterestApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      { provide: NetworkStatusService, useValue: { isOnline: online } },
      { provide: PLATFORM_ID, useValue: 'browser' },
    ],
  });
  TestBed.overrideProvider(MatSnackBar, { useValue: snackBar });
  const fixture = TestBed.createComponent(InterestToggle);
  fixture.componentRef.setInput('targetType', 'EVENT');
  fixture.componentRef.setInput('targetId', 'event-1');
  fixture.componentRef.setInput('targetName', 'Palestra aberta');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, api, auth, online, snackBar };
}

function interestState(interest: EventInterest | null, subscribed = false, endsAt = publicFixtureDateFromNow(1)) {
  return { interest, subscribed, endsAt, enabled: true };
}
