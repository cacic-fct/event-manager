import { TestBed } from '@angular/core/testing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { EmojiService } from '../../../shared/emoji.service';
import { SubscriptionEventList } from './event-list';

describe('SubscriptionEventList', () => {
  it('shows the available slots and projected queue position', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionEventList],
      providers: [{ provide: EmojiService, useValue: { getTwemojiUrl: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionEventList);
    const event = { id: 'event-1' } as PublicEvent;
    fixture.componentRef.setInput('events', [event]);
    fixture.componentRef.setInput(
      'summariesByEventId',
      new Map([
        [
          event.id,
          { eventId: event.id, hasAvailableSlots: true, availableSlots: 2, projectedQueuePosition: 4 },
        ],
      ]),
    );
    fixture.componentRef.setInput('selectedEventIds', new Set());
    fixture.componentRef.setInput('autoSelectedEventIds', new Set());
    fixture.componentRef.setInput('disabledReasons', new Map());

    expect(fixture.componentInstance.slotsLine(event)).toBe('2 vagas disponíveis · Posição 4 na fila');
  });
});
