import { Permission } from '@cacic-fct/shared-permissions';
import { EventAudienceService } from './event-audience.service';

function setup() {
  const prisma = {
    people: { findMany: jest.fn().mockResolvedValue([{ id: 'person-final' }]) },
    user: { findUnique: jest.fn().mockResolvedValue({ email: 'member@example.com' }) },
  };
  const authorization = { evaluateGlobalPermissions: jest.fn().mockResolvedValue([]) };
  const accountManager = { lookupUsersByEmail: jest.fn().mockResolvedValue([]) };
  const merges = { resolveFinalUserId: jest.fn().mockImplementation(async (id: string) => id === 'old-user' ? 'final-user' : id) };
  const service = new EventAudienceService(prisma as never, authorization as never,
    { isEnabled: () => false } as never, accountManager as never, merges as never);
  const user = { sub: 'final-user', email: 'member@example.com', claims: {} };
  return { service, prisma, authorization, accountManager, merges, user };
}

describe('audience principals', () => {
  afterEach(() => jest.useRealTimers());

  it('uses the final merged account for people, remote identity, and permissions', async () => {
    const { service, prisma, authorization, accountManager, user } = setup();
    const principal = await service.principalForUser({ ...user, sub: 'old-user' } as never);
    expect(principal).toMatchObject({ userId: 'final-user', personIds: ['person-final'] });
    expect(prisma.people.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'final-user', deletedAt: null, mergedIntoId: null } }));
    expect(authorization.evaluateGlobalPermissions).toHaveBeenCalledWith(expect.objectContaining({ sub: 'final-user' }), [Permission.EventAudience.Bypass]);
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(1);
    await service.principalForStoredUser('old-user');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'final-user' }, select: { email: true } });
  });

  it('coalesces concurrent lookups and expires negative cached profiles', async () => {
    jest.useFakeTimers();
    const { service, accountManager, user } = setup();
    await Promise.all([service.principalForUser(user as never), service.principalForUser(user as never)]);
    await service.principalForStoredUser(user.sub);
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_001);
    await service.principalForUser(user as never);
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(2);
  });

  it('caches positive results without sharing them with a different user ID', async () => {
    const { service, accountManager, user } = setup();
    accountManager.lookupUsersByEmail.mockResolvedValue([{ userId: user.sub, email: 'member@example.com', secondaryEmails: ['member@unesp.br'] }] as never);
    expect(await service.principalForUser(user as never)).toMatchObject({ isUnesp: true });
    expect(await service.principalForUser(user as never)).toMatchObject({ isUnesp: true });
    expect(await service.principalForUser({ ...user, sub: 'other-user' } as never)).toMatchObject({ isUnesp: false });
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(2);
  });

  it('caches failure fallback and bounds retained profiles', async () => {
    const { service, accountManager, user } = setup();
    accountManager.lookupUsersByEmail.mockRejectedValueOnce(new Error('unavailable'));
    await service.principalForUser(user as never);
    await service.principalForUser(user as never);
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 1001; i++) await service.principalForUser({ ...user, sub: `user-${i}` } as never);
    await service.principalForUser(user as never);
    expect(accountManager.lookupUsersByEmail).toHaveBeenCalledTimes(1003);
  });

  it('uses the full Account Manager course tuple when signed course claims are incomplete', async () => {
    const { service, accountManager, user } = setup();
    accountManager.lookupUsersByEmail.mockResolvedValueOnce([{
      userId: user.sub,
      email: 'student@unesp.br',
      secondaryEmails: [],
      enrollmentNumber: '00123456',
      unespRole: 'aluno-graduacao',
      unespRoleVerified: true,
    }] as never);

    await expect(service.principalForUser({
      ...user,
      claims: { unesp_role: 'aluno-graduacao' },
    } as never)).resolves.toMatchObject({ isUnesp: true, verifiedCourseCode: '12' });
  });

  it('preserves a complete signed course tuple when the profile disagrees', async () => {
    const { service, accountManager, user } = setup();
    accountManager.lookupUsersByEmail.mockResolvedValueOnce([{
      userId: user.sub,
      email: 'student@unesp.br',
      secondaryEmails: [],
      enrollmentNumber: '00123456',
      unespRole: 'aluno-graduacao',
      unespRoleVerified: true,
    }] as never);

    await expect(service.principalForUser({
      ...user,
      email: 'student@unesp.br',
      claims: {
        enrollment_number: '00123456',
        unesp_role: 'docente',
        unesp_role_verified: true,
      },
    } as never)).resolves.toMatchObject({ isUnesp: true, verifiedCourseCode: null });
  });
});
