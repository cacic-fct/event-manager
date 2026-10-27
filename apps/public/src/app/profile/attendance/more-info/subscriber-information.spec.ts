import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { AttendancesApiService } from '../attendances-api.service';
import { SubscriberInformation } from './subscriber-information';

describe('subscriber information', () => {
  const getSubscriberInformation = vi.fn();
  beforeEach(() => {
    getSubscriberInformation.mockReset().mockReturnValue(of(null));
    TestBed.configureTestingModule({
      providers: [{ provide: AttendancesApiService, useValue: { getSubscriberInformation } }],
    });
  });

  it('renders Markdown links and excludes an empty section when no content is accessible', async () => {
    const fixture = TestBed.createComponent(SubscriberInformation);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    getSubscriberInformation.mockReturnValue(of('[Reunião](https://example.org/reuniao)'));
    await fixture.componentInstance.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe('https://example.org/reuniao');
  });

  it('clears private content when the selected event changes and ignores a stale response', async () => {
    const pending = new Subject<string | null>();
    getSubscriberInformation.mockReturnValueOnce(pending).mockReturnValue(of('Evento atual'));
    const fixture = TestBed.createComponent(SubscriberInformation);
    fixture.componentRef.setInput('eventId', 'old');
    fixture.detectChanges();
    fixture.componentRef.setInput('eventId', 'current');
    fixture.detectChanges();
    await fixture.whenStable();
    pending.next('Evento anterior');
    pending.complete();
    await fixture.whenStable();
    expect(fixture.componentInstance.content()).toBe('Evento atual');
  });

  it('offers recovery after a connection error', async () => {
    getSubscriberInformation.mockReturnValue(throwError(() => new Error('Offline')));
    const fixture = TestBed.createComponent(SubscriberInformation);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Tentar novamente');
  });
  it('refreshes inline instructions when a notification opens a new content revision on the same page', async () => {
    const params = new BehaviorSubject(convertToParamMap({}));
    TestBed.configureTestingModule({ providers: [{ provide: ActivatedRoute, useValue: { queryParamMap: params } }] });
    getSubscriberInformation.mockReturnValue(of('Orientações anteriores'));
    const fixture = TestBed.createComponent(SubscriberInformation);
    fixture.componentRef.setInput('eventId', 'event');
    fixture.detectChanges();
    await fixture.whenStable();
    getSubscriberInformation.mockReturnValue(of('Novo link de acesso'));
    params.next(convertToParamMap({ informationRevision: 'new-revision' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.content()).toBe('Novo link de acesso');
  });
});
