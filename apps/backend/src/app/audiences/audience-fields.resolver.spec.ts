import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventAudienceFieldsResolver, EventGroupAudienceFieldsResolver, MajorEventAudienceFieldsResolver } from './audience-fields.resolver';

it.each([
  [EventAudienceFieldsResolver, 'event', Permission.Event.Update],
  [EventGroupAudienceFieldsResolver, 'eventGroup', Permission.EventGroup.Update],
  [MajorEventAudienceFieldsResolver, 'majorEvent', Permission.MajorEvent.Update],
] as const)('protects invitee PII in %s', async (Resolver, model, permission) => {
  const query = jest.fn().mockImplementation(async ({ select }) => ({
    audienceInvitations: [{ personId: 'person-1', ...(select.audienceInvitations.select.person ? { person: { id: 'person-1', name: 'Pessoa', email: 'private@example.com' } } : {}) }],
  }));
  const authorization = { assertPermissions: jest.fn(), evaluateGlobalPermissions: jest.fn().mockResolvedValue([]) };
  const resolver = new Resolver({ [model]: { findUniqueOrThrow: query } } as never, authorization as never);
  const context = { req: { user: { sub: 'organizer' } } } as never;
  expect(await resolver.audienceInvitations({ id: 'target-1' }, context)).toEqual([{ personId: 'person-1', person: null }]);
  expect(query).toHaveBeenLastCalledWith({ where: { id: 'target-1' }, select: { audienceInvitations: { select: { personId: true } } } });
  expect(authorization.assertPermissions).toHaveBeenCalledWith({ sub: 'organizer' }, [permission], expect.any(Object));
  authorization.evaluateGlobalPermissions.mockResolvedValue([Permission.Person.Read] as never);
  expect(await resolver.audienceInvitations({ id: 'target-1' }, context)).toEqual([{ personId: 'person-1', person: { id: 'person-1', name: 'Pessoa', email: 'private@example.com' } }]);
  authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
  expect(await resolver.audienceInvitations({ id: 'target-1' }, context)).toEqual([]);
  expect(query).toHaveBeenCalledTimes(2);
});
