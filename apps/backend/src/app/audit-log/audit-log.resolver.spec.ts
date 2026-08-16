import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogResolver } from './audit-log.resolver';
import type { AuditLogEntityHistoryInput, AuditLogExplorerInput, AuditLogRevertInput } from './audit-log.models';
import type { AuditLogService } from './audit-log.service';

describe('AuditLogResolver', () => {
  const actor = { sub: 'super-admin-1' } as AuthenticatedUser;
  const auditLog = {
    listEntityHistory: jest.fn(),
    exploreAuditLogs: jest.fn(),
    revertEntry: jest.fn(),
  };
  const resolver = new AuditLogResolver(auditLog as unknown as AuditLogService);

  beforeEach(() => jest.clearAllMocks());

  it('restricts every audit-log operation to super administrators', () => {
    for (const operation of ['auditLogEntries', 'auditLogExplorer', 'revertAuditLogEntry'] as const) {
      expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AuditLogResolver.prototype[operation])).toEqual([
        EventManagerKeycloakRole.SuperAdmin,
      ]);
    }
  });

  it('loads bounded entity history with the req actor', async () => {
    const input = { entityType: 'Event', entityId: 'event-1' } as AuditLogEntityHistoryInput;
    const expected = [{ id: 'audit-1' }];
    auditLog.listEntityHistory.mockResolvedValueOnce(expected);

    await expect(resolver.auditLogEntries(input, { req: { user: actor } }, 25)).resolves.toBe(expected);
    expect(auditLog.listEntityHistory).toHaveBeenCalledWith('Event', 'event-1', actor, 25);
  });

  it('searches the explorer with the request actor fallback', async () => {
    const input = { query: 'alterado' } as AuditLogExplorerInput;
    const expected = { entries: [], total: 0 };
    auditLog.exploreAuditLogs.mockResolvedValueOnce(expected);

    await expect(resolver.auditLogExplorer(input, { request: { user: actor } })).resolves.toBe(expected);
    expect(auditLog.exploreAuditLogs).toHaveBeenCalledWith(input, actor);
  });

  it('reverts an entry with an optional actor and propagates failures', async () => {
    const input = { auditLogEntryId: 'audit-1' } as AuditLogRevertInput;
    const expected = { id: 'audit-revert' };
    auditLog.revertEntry.mockResolvedValueOnce(expected);

    await expect(resolver.revertAuditLogEntry(input, {})).resolves.toBe(expected);
    expect(auditLog.revertEntry).toHaveBeenCalledWith(input, undefined);

    auditLog.revertEntry.mockRejectedValueOnce(new Error('Reversão indisponível.'));
    await expect(resolver.revertAuditLogEntry(input, { req: { user: actor } })).rejects.toThrow(
      'Reversão indisponível.',
    );
  });
});
