import { ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import type { Prisma } from '@prisma/client';
import type { TransferDocument } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import type { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import type { FrozenResourceService } from '../../common/frozen-resource.service';
import { DataTransferJournalService } from '../data-transfer-journal.service';
import { DataTransferService } from '../data-transfer.service';
import { EventTicketTransferAdapter } from '../event-ticket-transfer.adapter';
import { PersonTransferMatcherService } from '../person-transfer-matcher.service';
import { TransferKeyAllocations } from '../transfer-key-allocations';
import type { DataTransferAdapter } from '../data-transfer-adapter';
import { createTransferDatabaseFixture } from './transfer-database.fixtures';

const { jest } = import.meta;

/** Real planning, matching, ticket writes and journaling; external authorization and delivery are controlled. */
export async function createTicketTransferFixture() {
  const storage = await createTransferDatabaseFixture();
  const { database, client, prisma } = storage;
  const now = new Date();
  const actor: AuthenticatedUser = {
    realm_access: { roles: ['access'] },
    sub: 'organizer-1',
    preferredUsername: 'Organizador',
    token: 'controlled-test-token',
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: { is_onboarded: true },
  };
  const denied = new Set<Permission>();
  const authorization = {
    hasEventManagerAccess: () => true,
    isSuperAdmin: () => false,
    buildResourceContext: () => ({}),
    assertPermissions: jest.fn(async (_actor: unknown, permissions: readonly Permission[]) => {
      if (permissions.some((permission) => denied.has(permission))) throw new ForbiddenException();
    }),
  };
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = {
    enqueueForUsers: jest.fn(async (tx: Prisma.TransactionClient, users: (string | null | undefined)[]) => {
      for (const userId of new Set(users.filter((id): id is string => !!id))) {
        await tx.ticketRealtimeOutbox.create({
          data: { recipientUserId: userId, type: 'TICKETS_CHANGED', eventId: 'event-1' },
        });
      }
    }),
  };
  const policy = authorization as unknown as AuthorizationPolicyService;
  const frozenResources = frozen as unknown as FrozenResourceService;
  const adapter = new EventTicketTransferAdapter(policy, new PersonTransferMatcherService(prisma), realtime as never);
  const createService = (additionalAdapters: readonly DataTransferAdapter[] = []) =>
    new DataTransferService(
      prisma,
      policy,
      frozenResources,
      [...additionalAdapters, adapter],
      new TransferKeyAllocations(),
      new DataTransferJournalService(prisma, policy, frozenResources),
    );
  const transfer = createService();
  await client.event.create({
    data: {
      id: 'event-1',
      name: 'Jantar',
      endDate: new Date(now.getTime() + 86_400_000),
      eventGroupId: null,
      majorEventId: null,
    },
  });
  await client.ticketConfig.create({
    data: { id: 'config-1', eventId: 'event-1', enabled: true, expirationMode: 'EVENT_END', customExpiresAt: null },
  });
  for (const id of ['person-1', 'person-2']) {
    await client.people.create({
      data: {
        id,
        name: id === 'person-1' ? 'Ana Silva' : 'Bruno Santos',
        userId: `user-${id}`,
        mergedIntoId: null,
        secondaryEmails: [],
        email: null,
        phone: null,
        academicId: null,
        identityDocument: null,
        isCPF: null,
      },
    });
  }
  const document: TransferDocument = {
    format: 'cacic-event-data',
    version: 1,
    resources: [
      {
        kind: 'event-ticket',
        key: 'IMPORTED-TICKET',
        data: {
          eventId: 'event-1',
          person: { id: 'person-1' },
          source: 'ADMIN',
          sourceKey: null,
          status: 'ACTIVE',
          issuedAt: new Date(now.getTime() - 3_600_000).toISOString(),
          expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
          consumedAt: null,
          revokedAt: null,
          revokedReason: null,
        },
      },
    ],
  };
  const state = async () =>
    (await database.query('SELECT model, id, data FROM transfer_fixture ORDER BY model, id')).rows;
  return {
    ...storage,
    actor,
    denied,
    authorization,
    frozen,
    realtime,
    adapter,
    transfer,
    createService,
    document,
    state,
  };
}
