import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { PeopleResolver } from './resolver';

describe('scoped related-person operations', () => {
  it('keeps relatedPeople scoped separately from the global people directory', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PeopleResolver.prototype.relatedPeople)).toEqual([
      Permission.RelatedPerson.Read,
    ]);
  });

  it('requires the narrower related-person update permission for updateRelatedPerson', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, PeopleResolver.prototype.updateRelatedPerson)).toEqual([
      Permission.RelatedPerson.Update,
    ]);
  });

  it('does not search contact fields without prize-draw contact permission', async () => {
    const prisma = { people: { findMany: jest.fn().mockResolvedValue([]) } };
    const authorizationPolicy = { canOverrideFrozenResource: jest.fn().mockResolvedValue(false) };
    const resolver = new PeopleResolver(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      authorizationPolicy as never,
    );

    await resolver.relatedPeople('contato@example.com', 'event-1');

    const queryWhere = prisma.people.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(queryWhere)).not.toContain('email');
    expect(JSON.stringify(queryWhere)).not.toContain('phone');
    expect(JSON.stringify(queryWhere)).toContain('identityDocument');
  });
});
