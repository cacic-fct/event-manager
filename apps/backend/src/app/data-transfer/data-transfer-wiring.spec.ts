import { Test } from '@nestjs/testing';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AudienceInvitationService } from '../audiences/audience-invitation.service';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { TicketIssuanceService } from '../tickets/ticket-issuance.service';
import { EventSitemapService } from '../public-events/event-sitemap.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { CertificateTargetsService } from '../certificate/certificate-targets.service';
import { CertificateValidationService } from '../certificate/certificate-validation.service';
import { TicketRealtimeService } from '../tickets/ticket-realtime.service';
import { PersonTransferMatcherService } from './person-transfer-matcher.service';
import { EventTreeTransferAdapter } from './event-tree-transfer.adapter';
import { ConfigurationTransferAdapter } from './configuration-transfer.adapter';
import { DataTransferService } from './data-transfer.service';
import { DataTransferController } from './data-transfer.controller';
import { TransferKeyAllocations } from './transfer-key-allocations';
import { DATA_TRANSFER_ADAPTERS } from './data-transfer.constants';
import type { TransferAdapterContext } from './data-transfer-adapter';
const { jest } = import.meta;

it('resolves Nest providers and uses the injected authorization services for tree and configuration transfers', async () => {
  const now = new Date();
  const event = {
    id: 'event-1',
    name: 'Evento autorizado',
    updatedAt: now,
    startDate: now,
    endDate: new Date(now.getTime() + 3600000),
    deletedAt: null,
  };
  const tx = { event: { findFirst: jest.fn().mockResolvedValue(event) } };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
  };
  const authorization = {
    hasEventManagerAccess: () => true,
    grantedPermissionSet: jest.fn().mockResolvedValue(new Set([Permission.DataTransfer.Export])),
    assertPermissions: jest.fn().mockResolvedValue(undefined),
  };
  const otherDependencies = [
    FrozenResourceService,
    AuditLogService,
    AudienceInvitationService,
    EventPostCommitEffectsService,
    AttendanceCategoryService,
    CurrentUserOnlineAttendanceRealtimeService,
    SportsBackingResourceLifecycleService,
    TicketIssuanceService,
    EventSitemapService,
    TypesenseSearchService,
    RealtimeInvalidationService,
    CertificateTargetsService,
    CertificateValidationService,
    TicketRealtimeService,
    PersonTransferMatcherService,
  ];
  const module = await Test.createTestingModule({
    controllers: [DataTransferController],
    providers: [
      DataTransferService,
      EventTreeTransferAdapter,
      ConfigurationTransferAdapter,
      TransferKeyAllocations,
      { provide: PrismaService, useValue: prisma },
      { provide: AuthorizationPolicyService, useValue: authorization },
      ...otherDependencies.map((provide) => ({ provide, useValue: {} })),
      {
        provide: DATA_TRANSFER_ADAPTERS,
        useFactory: (tree: EventTreeTransferAdapter) => [tree],
        inject: [EventTreeTransferAdapter],
      },
    ],
  }).compile();
  try {
    const actor = { sub: 'organizer-1' } as AuthenticatedUser;
    expect(await module.get(DataTransferController).schema({ user: actor } as never)).toMatchObject({
      $id: 'urn:cacic:event-data:v2',
    });
    const exported = await module
      .get(DataTransferService)
      .export(
        { target: { kind: 'event', id: event.id }, includeDescendants: false, includeConfiguration: false },
        actor,
      );
    expect(exported.document).toMatchObject({ $schema: 'urn:cacic:event-data:v2', version: 2 });
    expect(exported.document.resources).toEqual([
      expect.objectContaining({ kind: 'event', id: event.id, data: expect.objectContaining({ name: event.name }) }),
    ]);
    await module.get(ConfigurationTransferAdapter).assertRead(
      {
        resource: { kind: 'place-preset', id: 'place-1', data: { name: 'Local' } },
        current: { kind: 'place-preset', id: 'place-1', data: { name: 'Local' } },
        revision: null,
        dependencies: [],
        scope: {},
      },
      { actor, tx } as unknown as TransferAdapterContext,
    );
    expect(authorization.assertPermissions).toHaveBeenLastCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.PlacePreset.Read],
      {},
    );
  } finally {
    await module.close();
  }
});
