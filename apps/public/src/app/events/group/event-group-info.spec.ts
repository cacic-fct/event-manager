import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createParticipationInformationFixture } from '@cacic-fct/event-manager-public-testing';
import { EventGroupInfo } from './event-group-info';

const data = createParticipationInformationFixture({ targetType: 'event-group' });

describe('EventGroupInfo', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [EventGroupInfo], providers: [provideRouter([])] }));

  it('orders activities chronologically and keeps registration context when opening an activity', () => {
    const fixture = TestBed.createComponent(EventGroupInfo);
    fixture.componentRef.setInput('group', data.eventGroup);
    fixture.componentRef.setInput('events', [...data.events].reverse());
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('section.program a'));
    const destinations = links.map((link) => new URL(link.href));
    expect(destinations.map((url) => url.pathname)).toEqual(data.events.map((event) => `/event/${event.id}`));
    expect(destinations.map((url) => url.searchParams.get('returnUrl'))).toEqual(
      data.events.map(() => `/event-group/${data.targetId}`),
    );
  });

  it('avoids claiming a total workload or certificate rules when their data is incomplete', () => {
    const fixture = TestBed.createComponent(EventGroupInfo);
    fixture.componentRef.setInput('group', { ...data.eventGroup, shouldIssueCertificate: undefined });
    fixture.componentRef.setInput(
      'events',
      data.events.map((event, index) => ({ ...event, creditMinutes: index === 0 ? null : 60 })),
    );
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).not.toContain('Carga horária total');
    expect(host.querySelector('#group-certificates-heading')).toBeNull();
  });

  it('keeps certificate rules in a disclosure beside the group context', () => {
    const fixture = TestBed.createComponent(EventGroupInfo);
    fixture.componentRef.setInput('group', {
      ...data.eventGroup,
      shouldIssueCertificate: true,
      shouldIssueCertificateForEachEvent: true,
    });
    fixture.componentRef.setInput('events', data.events);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const disclosure = host.querySelector<HTMLDetailsElement>('details.certificate-rules');
    expect(disclosure?.open).toBe(false);
    expect(disclosure?.querySelector('summary')?.textContent).toBe('Certificados');
    expect(disclosure?.textContent).toContain('Há emissão de certificado por evento.');
    expect(disclosure?.nextElementSibling?.classList.contains('participation-workspace')).toBe(true);
  });

  it('prioritizes the existing participation over a second registration invitation', () => {
    const fixture = TestBed.createComponent(EventGroupInfo);
    fixture.componentRef.setInput('group', data.eventGroup);
    fixture.componentRef.setInput('events', data.events);
    fixture.componentRef.setInput('hasParticipation', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('#group-registration-heading')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#group-program-heading')).not.toBeNull();
  });
});
