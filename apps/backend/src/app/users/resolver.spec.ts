import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { UsersResolver } from './resolver';

describe('UsersResolver', () => {
  const findMany = jest.fn();
  const findUnique = jest.fn();
  const resolver = new UsersResolver({ user: { findMany, findUnique } } as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires user read permission for both collection and detail operations', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, UsersResolver.prototype.users)).toEqual([
      Permission.User.Read,
    ]);
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, UsersResolver.prototype.user)).toEqual([Permission.User.Read]);
  });

  it('normalizes pagination and returns newest users first', async () => {
    const users = [{ id: 'user-1' }];
    findMany.mockResolvedValue(users);

    await expect(resolver.users(-2, 2_000)).resolves.toBe(users);
    expect(findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, skip: 0, take: 1_000 });
  });

  it('rejects invalid pagination before querying the database', () => {
    expect(() => resolver.users(1.5, 20)).toThrow(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns a user by identifier and rejects missing records', async () => {
    const user = { id: 'user-1' };
    findUnique.mockResolvedValueOnce(user).mockResolvedValueOnce(null);

    await expect(resolver.user('user-1')).resolves.toBe(user);
    expect(findUnique).toHaveBeenNthCalledWith(1, { where: { id: 'user-1' } });
    await expect(resolver.user('missing')).rejects.toThrow(NotFoundException);
  });
});
