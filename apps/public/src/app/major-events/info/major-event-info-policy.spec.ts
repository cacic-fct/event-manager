import { createPublicMajorEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { majorEventInfoLinks, majorEventRegistrationInfo } from './major-event-info-policy';

const now = () => Date.now();
const event = () =>
  createPublicMajorEvent({
    endDate: publicFixtureDateFromNow(5),
    subscriptionStartDate: publicFixtureDateFromNow(-5),
    subscriptionEndDate: publicFixtureDateFromNow(4),
    hasEvents: true,
    regularSubscriptionOpen: true,
  });

function subscription(status: string): CurrentUserMajorEventSubscription {
  return { subscriptionStatus: status, selectedEvents: [{ id: 'chosen' }] } as CurrentUserMajorEventSubscription;
}

describe('majorEventRegistrationInfo', () => {
  it('keeps guests on an explicit login action and preserves ranked signup routing', () => {
    expect(majorEventRegistrationInfo(event(), false, null, now()).action).toEqual({
      label: 'Entrar para inscrever-se',
      login: true,
    });
    const ranked = { ...event(), rankedSubscriptionEnabled: true };
    expect(majorEventRegistrationInfo(ranked, true, null, now()).action?.route).toEqual([
      '/major-event',
      ranked.id,
      'ranked-subscription',
    ]);
  });

  it('has no signup action before opening, after closing, or after the event ends', () => {
    expect(
      majorEventRegistrationInfo({ ...event(), subscriptionStartDate: publicFixtureDateFromNow(1) }, true, null, now())
        .title,
    ).toBe('Inscrições em breve');
    expect(
      majorEventRegistrationInfo({ ...event(), regularSubscriptionOpen: false }, false, null, now()).action,
    ).toBeUndefined();
    expect(
      majorEventRegistrationInfo({ ...event(), subscriptionEndDate: publicFixtureDateFromNow(-1) }, true, null, now())
        .action,
    ).toBeUndefined();
    expect(
      majorEventRegistrationInfo({ ...event(), endDate: publicFixtureDateFromNow(-1) }, true, null, now()).title,
    ).toBe('Evento encerrado');
  });

  it('routes receipt corrections to payment and confirmed participants to their participations', () => {
    const paid = { ...event(), isPaymentRequired: true };
    expect(
      majorEventRegistrationInfo(paid, true, subscription('REJECTED_INVALID_RECEIPT'), now()).action?.route,
    ).toEqual(['/major-event', paid.id, 'payment']);
    expect(
      majorEventRegistrationInfo(
        { ...paid, endDate: publicFixtureDateFromNow(-1) },
        true,
        subscription('WAITING_RECEIPT_UPLOAD'),
        now(),
      ).action?.route,
    ).toEqual(['/major-event', paid.id, 'payment']);
    expect(majorEventRegistrationInfo(event(), true, subscription('CONFIRMED'), now()).action?.route).toEqual([
      '/profile',
      'attendances',
    ]);
  });

  it('uses tournament self-registration when the major event has no regular activities', () => {
    const tournament = {
      ...event(),
      hasEvents: false,
      sportsTournament: { id: 'cup', selfSubscriptionEnabled: true, registrationOpen: true },
    };
    expect(majorEventRegistrationInfo(tournament, true, null, now()).action?.route).toEqual([
      '/tournament',
      'cup',
      'subscribe',
    ]);
    expect(
      majorEventRegistrationInfo(
        { ...tournament, sportsTournament: { ...tournament.sportsTournament, registrationOpen: false } },
        true,
        null,
        now(),
      ).action,
    ).toBeUndefined();
  });
});

describe('majorEventInfoLinks', () => {
  it('rejects executable external URLs and creates explicit contact protocols', () => {
    expect(majorEventInfoLinks({ ...event(), buttonLink: 'javascript:alert(1)', contactInfo: null })).toEqual([]);
    expect(
      majorEventInfoLinks({
        ...event(),
        buttonLink: null,
        contactType: 'EMAIL',
        contactInfo: 'organization@example.com',
      })[0]?.href,
    ).toBe('mailto:organization@example.com');
    expect(
      majorEventInfoLinks({
        ...event(),
        buttonLink: null,
        contactType: 'WHATSAPP',
        contactInfo: '+55 (18) 99999-9999',
      })[0]?.href,
    ).toBe('https://wa.me/5518999999999');
  });
});
