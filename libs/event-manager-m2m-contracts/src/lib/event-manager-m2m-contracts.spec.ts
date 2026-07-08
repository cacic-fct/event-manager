import {
  EVENT_MANAGER_M2M_API_PREFIX,
  EVENT_MANAGER_M2M_VOTING_ROLES,
  EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES,
  EVENT_MANAGER_M2M_VOTING_ROUTES,
  type EventManagerM2mVotingRole,
} from './event-manager-m2m-contracts';

describe('event manager M2M contracts', () => {
  it('keeps the API prefix and voting role stable for external consumers', () => {
    const votingRole: EventManagerM2mVotingRole = EVENT_MANAGER_M2M_VOTING_ROLES.READ;

    expect(EVENT_MANAGER_M2M_API_PREFIX).toBe('/api');
    expect(votingRole).toBe('voting-integration:read');
  });

  it('exposes route templates that match generated concrete routes', () => {
    expect(EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES).toEqual({
      EVENTS: '/api/internal/voting/events',
      ATTENDANCE_CHECK: '/api/internal/voting/events/:eventId/attendance-check',
      PEOPLE_LOOKUP: '/api/internal/voting/people/lookup',
      PEOPLE_IDENTIFIER_LOOKUP: '/api/internal/voting/people/identifier-lookup',
    });

    expect(EVENT_MANAGER_M2M_VOTING_ROUTES.events()).toBe(EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES.EVENTS);
    expect(EVENT_MANAGER_M2M_VOTING_ROUTES.peopleLookup()).toBe(
      EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES.PEOPLE_LOOKUP,
    );
    expect(EVENT_MANAGER_M2M_VOTING_ROUTES.peopleIdentifierLookup()).toBe(
      EVENT_MANAGER_M2M_VOTING_ROUTE_TEMPLATES.PEOPLE_IDENTIFIER_LOOKUP,
    );
  });

  it('encodes event ids inside attendance-check routes', () => {
    expect(EVENT_MANAGER_M2M_VOTING_ROUTES.attendanceCheck('event 1/2026')).toBe(
      '/api/internal/voting/events/event%201%2F2026/attendance-check',
    );
  });
});
