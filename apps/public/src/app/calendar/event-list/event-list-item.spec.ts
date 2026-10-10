import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  createPublicStoryEvent,
  createPublicStoryEventGroup,
  createPublicStorySportsMatchEvent,
} from '../../testing/public-event-story-fixtures';
import { CalendarEventListItem } from './event-list-item';

describe('CalendarEventListItem', () => {
  it('keeps major-event, group, and event-summary context on separate metadata lines', async () => {
    const majorEvent = createPublicStoryEvent({
      id: 'event-with-two-parents',
      name: 'Minicurso de acessibilidade',
      type: 'MINICURSO',
      context: 'major-event',
      majorEventName: 'Congresso de tecnologia',
    });
    const group = createPublicStoryEventGroup({ id: 'frontend-track', name: 'Trilha de acessibilidade' });
    const event = {
      ...majorEvent,
      eventGroup: group,
      eventGroupId: group.id,
      shortDescription: 'Atividade prática com leitores de tela.',
    };

    await TestBed.configureTestingModule({
      imports: [CalendarEventListItem],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarEventListItem);
    fixture.componentRef.setInput('event', event);
    fixture.detectChanges();

    expect(Array.from(fixture.nativeElement.querySelectorAll('.metadata-item'), (item: Element) => item.textContent?.trim())).toEqual([
      'Congresso de tecnologia',
      'Trilha de acessibilidade',
      'Atividade prática com leitores de tela.',
      'Minicurso',
      'Laboratório 01',
    ]);
  });

  it('keeps a sports match event linked to its match detail route', async () => {
    const event = createPublicStorySportsMatchEvent();
    expect(event.sportsMatch?.id).toBe('sports-match-story');
    await TestBed.configureTestingModule({
      imports: [CalendarEventListItem],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(CalendarEventListItem);
    fixture.componentRef.setInput('event', event);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a[mat-list-item]') as HTMLAnchorElement;
    const href = link.getAttribute('href');
    expect(href).toContain('/sports/match/sports-match-story');
    expect(href).toContain('returnUrl=%2Fcalendar');
  });
});
