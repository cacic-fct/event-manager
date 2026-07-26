import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { TestBed } from '@angular/core/testing';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { createPublicEvent } from '@cacic-fct/event-manager-public-testing';
import { EmojiService } from '../../../shared/emoji.service';
import { SubscriptionEventList } from './event-list';

registerLocaleData(localePt);

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
        [event.id, { eventId: event.id, hasAvailableSlots: true, availableSlots: 2, projectedQueuePosition: 4 }],
      ]),
    );
    fixture.componentRef.setInput('selectedEventIds', new Set());
    fixture.componentRef.setInput('autoSelectedEventIds', new Set());
    fixture.componentRef.setInput('disabledReasons', new Map());

    expect(fixture.componentInstance.slotsLine(event)).toBe('2 vagas disponíveis · Posição 4 na fila');
  });

  it('does not allow selecting an event with no available slots', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionEventList],
      providers: [{ provide: EmojiService, useValue: { getTwemojiUrl: vi.fn() } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionEventList);
    const event = createPublicEvent({
      id: 'event-1',
      name: 'Evento sem vagas',
      emoji: '🧠',
      type: 'MINICURSO',
      shortDescription: null,
      locationDescription: null,
      eventGroupId: null,
    }) as PublicEvent;
    fixture.componentRef.setInput('events', [event]);
    fixture.componentRef.setInput(
      'summariesByEventId',
      new Map([
        [event.id, { eventId: event.id, hasAvailableSlots: false, availableSlots: 0, projectedQueuePosition: 1 }],
      ]),
    );
    fixture.componentRef.setInput('selectedEventIds', new Set());
    fixture.componentRef.setInput('autoSelectedEventIds', new Set());
    fixture.componentRef.setInput('disabledReasons', new Map([[event.id, 'Sem vagas disponíveis.']]));
    fixture.detectChanges();

    const checkbox = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });
});
