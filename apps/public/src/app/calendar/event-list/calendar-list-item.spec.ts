import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalendarListItem } from './calendar-list-item';

describe('CalendarListItem', () => {
  let fixture: ComponentFixture<CalendarListItem>;
  let startsAt: string;
  let endsAt: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarListItem],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarListItem);
    startsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    endsAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    fixture.componentRef.setInput('item', {
      id: 'party-ticket',
      name: 'Festa de encerramento',
      emoji: '🎉',
      startDate: startsAt,
      endDate: endsAt,
      contextLine: 'Congresso de Computação',
      contextLines: ['Congresso de Computação', 'Trilha Frontend'],
      eventType: 'PALESTRA',
      secondaryLines: ['Cedente: Marina'],
      locationDescription: 'Salão de eventos',
      route: ['/profile/ticket-transfers', 'transfer-1'],
      returnUrl: '/profile/ticket-transfers',
    });
    fixture.detectChanges();
  });

  it('renders a linked calendar item with contextual transfer metadata', () => {
    const link = fixture.nativeElement.querySelector('a[mat-list-item]') as HTMLAnchorElement;

    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Festa de encerramento');
    expect(link.textContent).toContain('Congresso de Computação');
    expect(link.textContent).toContain('Trilha Frontend');
    expect(link.textContent).toContain('Palestra');
    expect(link.textContent).toContain('Cedente: Marina');
    expect(link.textContent).toContain('Salão de eventos');
    expect(Array.from(fixture.nativeElement.querySelectorAll('.metadata-item'), (item: HTMLElement) => item.textContent?.trim())).toEqual([
      'Congresso de Computação',
      'Trilha Frontend',
      'Palestra',
      'Cedente: Marina',
      'Salão de eventos',
    ]);
    expect(link.getAttribute('aria-label')).toBe('Abrir Festa de encerramento');
  });

  it('renders hidden event summaries without a link', () => {
    fixture.componentRef.setInput('item', {
      id: 'hidden-event',
      name: 'Entrega do kit de boas-vindas',
      emoji: '🎁',
      startDate: startsAt,
      endDate: new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString(),
      contextLine: 'CACiC Eventos',
      route: null,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('a[mat-list-item]')).toBeNull();
    expect(fixture.nativeElement.querySelector('mat-list-item')?.textContent).toContain('Entrega do kit');
    expect(fixture.nativeElement.querySelector('mat-list-item a')).toBeNull();
  });

  it('does not repeat the event name when the ticket label matches it', () => {
    fixture.componentRef.setInput('item', {
      id: 'matching-ticket',
      name: 'Festa de encerramento',
      emoji: '🎉',
      startDate: startsAt,
      endDate: endsAt,
      contextLine: 'Festa de encerramento',
      route: ['/event', 'party'],
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[matListItemLine]')).toBeNull();
  });

  it('keeps a Material presentation list around the list item', () => {
    expect(fixture.nativeElement.querySelector('mat-list[role="presentation"]')).not.toBeNull();
  });
});
