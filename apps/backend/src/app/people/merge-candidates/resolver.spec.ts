import { AuditLogService } from '../../audit-log/audit-log.service';
import { MergeCandidatesResolver } from './resolver';

describe('MergeCandidatesResolver', () => {
  it('uses the authenticated user from either GraphQL request property for audit records', async () => {
    const prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      mergeCandidate: {
        create: jest.fn().mockResolvedValue({ id: 'candidate-1', pairKey: 'person-a:person-b' }),
      },
    };
    const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
    const resolver = new MergeCandidatesResolver(prisma as never, {} as never, auditLog as unknown as AuditLogService);
    const requestUser = { sub: 'request-user' } as never;
    const reqUser = { sub: 'req-user' } as never;
    const getUser = (resolver as unknown as {
      getUser(context: { req?: { user?: typeof reqUser }; request?: { user?: typeof reqUser } }): typeof reqUser;
    }).getUser.bind(resolver);

    expect(getUser({ request: { user: requestUser } })).toBe(requestUser);
    expect(getUser({ req: { user: reqUser }, request: { user: requestUser } })).toBe(reqUser);
    expect(getUser({})).toBeUndefined();

    await resolver.createMergeCandidate(
      { personAId: 'person-a', personBId: 'person-b', pairKey: 'person-a:person-b' },
      { request: { user: requestUser } } as never,
    );

    expect(prisma.mergeCandidate.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdById: 'request-user', updatedById: 'request-user' }) }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(expect.objectContaining({ actor: requestUser }), prisma);
  });
});
