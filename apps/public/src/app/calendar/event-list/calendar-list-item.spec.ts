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
    expect(
      Array.from(fixture.nativeElement.querySelectorAll('.metadata-item'), (item: HTMLElement) =>
        item.textContent?.trim(),
      ),
    ).toEqual(['Congresso de Computação', 'Trilha Frontend', 'Palestra', 'Cedente: Marina', 'Salão de eventos']);
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link.querySelector('[matListItemMeta]')).toBeNull();
    const title = link.querySelector('[matListItemTitle]') as HTMLElement;
    const subtitle = link.querySelector('.row-supporting-text') as HTMLElement;
    const time = link.querySelector('.time-range') as HTMLElement;
    const location = link.querySelector('.location-content') as HTMLElement;
    expect(title.compareDocumentPosition(subtitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(subtitle.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(time.compareDocumentPosition(location) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

    expect(fixture.nativeElement.querySelector('.row-supporting-text')).toBeNull();
    expect(fixture.nativeElement.querySelector('.time-range')).not.toBeNull();
  });

  it('keeps an explicit action hint separate from the visible accessible name', () => {
    fixture.componentRef.setInput('item', {
      ...fixture.componentInstance.item(),
      ariaLabel: 'Consultar transferência',
    });
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.hasAttribute('aria-label')).toBe(false);
    expect(link.getAttribute('aria-description')).toBe('Consultar transferência');
  });

  it('includes the end date when an activity continues into another day', () => {
    const start = new Date();
    start.setHours(22, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(2);
    fixture.componentRef.setInput('item', {
      ...fixture.componentInstance.item(),
      startDate: start,
      endDate: end,
    });
    fixture.detectChanges();
    const time = fixture.nativeElement.querySelector('.time-range').textContent;
    expect(time).toContain('22:00');
    expect(time).toContain('02:00');
    expect(time).toContain(`${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`);
  });

  it('keeps a Material presentation list around the list item', () => {
    expect(fixture.nativeElement.querySelector('mat-list[role="presentation"]')).not.toBeNull();
  });

  it('can place the emoji above the title without reserving a leading icon column', () => {
    expect(fixture.nativeElement.querySelector('[matListItemIcon]')).not.toBeNull();
    fixture.componentRef.setInput('iconPosition', 'top');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[matListItemIcon]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[matListItemTitle] .top-emoji img')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.time-content mat-icon')?.textContent).toBe('schedule');
    expect(fixture.nativeElement.textContent).toContain('Festa de encerramento');
  });
});
