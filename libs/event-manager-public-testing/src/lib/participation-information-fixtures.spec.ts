import {
  createParticipationInformationFixture,
  participationInformationGraphqlData,
} from './participation-information-fixtures';

describe('participation information GraphQL fixtures', () => {
  it('pages through a parent program without dropping activities at the cursor timestamp', () => {
    const fixture = createParticipationInformationFixture({ targetType: 'major-event' });
    const [first, second, third] = fixture.events;
    second.startDate = first.startDate;
    const query = 'query PublicMajorEventProgram { publicEvents(majorEventId: $majorEventId) { id } }';
    const variables = { majorEventId: fixture.targetId };

    expect(participationInformationGraphqlData(query, { ...variables, take: 1 }, fixture)).toEqual({
      publicEvents: [first],
    });
    expect(
      participationInformationGraphqlData(
        query,
        {
          ...variables,
          programAfter: { id: first.id, startDate: first.startDate },
        },
        fixture,
      ),
    ).toEqual({ publicEvents: [second, third] });
    expect(participationInformationGraphqlData(query, { majorEventId: 'another-major' }, fixture)).toEqual({
      publicEvents: [],
    });
  });

  it('returns participation for the requested group activity rather than the first activity', () => {
    const fixture = createParticipationInformationFixture({ targetType: 'event-group', attended: true });
    const event = fixture.events[1];
    const { currentUserEventGroupSubscription } = participationInformationGraphqlData(
      'query CurrentUserEventGroupDetails',
      { eventGroupId: fixture.targetId },
      fixture,
    );

    expect(currentUserEventGroupSubscription).toMatchObject({
      eventGroupId: fixture.targetId,
      events: fixture.events,
    });
    expect(
      participationInformationGraphqlData('query CurrentUserEventDetails', { eventId: event.id }, fixture),
    ).toMatchObject({
      currentUserEventSubscription: {
        eventId: event.id,
        eventGroupSubscriptionId: 'information-group-subscription',
      },
      currentUserEventAttendance: { eventId: event.id },
    });
  });

  it('keeps issued certificates available independently of subscription and subscriber guidance', () => {
    const fixture = createParticipationInformationFixture({ subscribed: false, issuedCertificate: true });

    expect(
      participationInformationGraphqlData('query CurrentUserCertificates', { scope: 'EVENT' }, fixture),
    ).toMatchObject({ currentUserCertificates: [{ config: { scope: 'EVENT' } }] });
    expect(participationInformationGraphqlData('query CurrentUserEventSubscriberInformation', {}, fixture)).toEqual({
      currentUserEventSubscriberInformation: null,
    });
    expect(participationInformationGraphqlData('query CurrentUserEventSubscriberInformationList', {}, fixture)).toEqual(
      { currentUserEventSubscriberInformationList: [] },
    );
  });
});
