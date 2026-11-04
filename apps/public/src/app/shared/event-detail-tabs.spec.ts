import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { EventDetailTabs } from './event-detail-tabs';

@Component({
  imports: [EventDetailTabs],
  template: `
    <ng-template #subscription>
      <label>Referência da inscrição <input aria-label="Referência da inscrição" /></label>
    </ng-template>
    <ng-template #general><p>Informações gerais do evento</p></ng-template>
    <app-event-detail-tabs
      [contextKey]="eventId()"
      [hasSubscription]="subscribed()"
      [subscriptionContent]="subscription"
      [generalContent]="general" />
  `,
})
class TabsHost {
  readonly subscribed = signal(true);
  readonly eventId = signal('event-one');
}

describe('EventDetailTabs', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TabsHost], providers: [provideNoopAnimations()] }));

  it('opens subscription first, preserves its content when switching tabs and resets for another event', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).not.toContain('Informações gerais do evento');
    const input = host.querySelector('input');
    if (!input) throw new Error('Subscription content must open first.');
    input.value = 'Minha referência';
    tabs[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(host.textContent).toContain('Informações gerais do evento');
    tabs[0].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelector('input')).toBe(input);
    expect(input.value).toBe('Minha referência');
    tabs[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.eventId.set('event-two');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('renders only general information without a tablist when there is no subscription', async () => {
    const fixture = TestBed.createComponent(TabsHost);
    fixture.componentInstance.subscribed.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.querySelector('input')).toBeNull();
    expect(host.textContent).toContain('Informações gerais do evento');
  });
});
