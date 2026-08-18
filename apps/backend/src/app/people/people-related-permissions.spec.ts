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
});
