import { ForbiddenException } from '@nestjs/common';
import { CertificateScope, PrizeDrawTargetType, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { PublicationBulkOperation } from '../../publishing/publishing.models';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ADMIN_MCP_OPERATIONS } from './catalog';
import { assertDynamicAdminMcpAdmission, DYNAMIC_ADMIN_MCP_ADMISSION_FIELDS } from './dynamic-admission';
const { jest } = import.meta;

function fixture() {
  const user: AuthenticatedUser = {
    sub: 'operator',
    token: '',
    claims: {},
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
  };
  const prisma = {
    contentReview: { findUnique: jest.fn(async () => ({ eventId: 'event-a' })) },
    event: {
      findUnique: jest.fn(async () => ({ id: 'event-a' })),
      findFirst: jest.fn(async () => ({ id: 'event-a' })),
      findMany: jest.fn(async () => [{ id: 'event-a' }, { id: 'event-b' }]),
    },
    eventGroup: { findFirst: jest.fn(async () => ({ id: 'group-a' })) },
    majorEvent: { findFirst: jest.fn(async () => ({ id: 'major-a' })) },
    ticketPurchase: { findUnique: jest.fn(async () => ({ majorEventId: 'major-a' })) },
    ticketConfig: {
      findUnique: jest.fn(async (): Promise<{ id: string } | null> => null),
    },
    eventForm: {
      findFirst: jest.fn(async () => ({
        id: 'form-a',
        ownerEventId: 'event-old',
        ownerMajorEventId: null,
        links: [],
      })),
    },
    prizeDraw: { findFirst: jest.fn(async () => ({ id: 'draw-a' })) },
    offlineEventAttendanceSubmission: {
      findMany: jest.fn(async () => [
        { id: 'submission-a', eventId: 'event-a' },
        { id: 'submission-b', eventId: 'event-b' },
      ]),
    },
    certificateConfig: {
      findFirst: jest.fn(async () => ({
        id: 'config-a',
        scope: CertificateScope.EVENT,
        eventId: 'event-a',
        eventGroupId: null,
        majorEventId: null,
        folderId: null,
      })),
    },
  };
  const policy = {
    assertPermissions: jest.fn(async () => undefined),
    isSuperAdmin: jest.fn((): boolean => false),
    buildResourceContext: jest.fn(() => ({ eventId: 'event-a', primaryResource: 'event' })),
  };
  const services = { prisma, policy };
  return { user, prisma, policy, services };
}

describe('dynamic administrative MCP admission', () => {
  it('has an explicit admission rule for every mutation with dynamic permissions', () => {
    const dynamicMutations = ADMIN_MCP_OPERATIONS.filter(
      (operation) => operation.kind === 'mutation' && operation.permissions.length === 0,
    );
    expect(dynamicMutations.map((operation) => operation.field).sort()).toEqual(
      [...DYNAMIC_ADMIN_MCP_ADMISSION_FIELDS].sort(),
    );
  });

  it('checks both the administrative parent and each actual child event for publication bundles', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'runPublicationBulkOperation',
      {
        input: {
          targetType: PublicationTargetType.MAJOR_EVENT,
          targetId: 'major-a',
          operation: PublicationBulkOperation.SCHEDULE_BUNDLE,
        },
      },
      f.user,
      f.services as never,
    );

    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.MajorEvent.Update], {
      majorEventId: 'major-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.Event.Update], {
      majorEventId: 'major-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.Event.Update], { eventId: 'event-a' });
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.Event.Update], { eventId: 'event-b' });
  });

  it('checks the broad person permission before looking up a content-review target', async () => {
    const f = fixture();
    f.policy.assertPermissions.mockRejectedValueOnce(new ForbiddenException());

    await expect(
      assertDynamicAdminMcpAdmission('blockContentReviewEditing', { id: 'review-a' }, f.user, f.services as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.prisma.contentReview.findUnique).not.toHaveBeenCalled();
  });

  it('checks every offline attendance submission target before a bulk proposal', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'approveOfflineEventAttendanceSubmissions',
      { submissionIds: ['submission-a', ' submission-b ', 'submission-a'] },
      f.user,
      f.services as never,
    );

    expect(f.prisma.offlineEventAttendanceSubmission.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['submission-a', 'submission-b'] } },
      select: { id: true, eventId: true },
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(1, f.user, [Permission.EventAttendance.Update], {
      eventId: 'event-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(2, f.user, [Permission.EventAttendance.Update], {
      eventId: 'event-b',
    });
  });

  it('rejects an offline batch if any requested target is missing', async () => {
    const f = fixture();
    f.prisma.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      { id: 'submission-a', eventId: 'event-a' },
    ]);
    await expect(
      assertDynamicAdminMcpAdmission(
        'rejectOfflineEventAttendanceSubmissions',
        { submissionIds: ['submission-a', 'missing'] },
        f.user,
        f.services as never,
      ),
    ).rejects.toThrow('Uma presença off-line não foi encontrada.');
    expect(f.policy.assertPermissions).not.toHaveBeenCalled();
  });

  it('rejects a mixed offline batch when a later target lacks native permission', async () => {
    const f = fixture();
    f.policy.assertPermissions.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new ForbiddenException());

    await expect(
      assertDynamicAdminMcpAdmission(
        'approveOfflineEventAttendanceSubmissions',
        { submissionIds: ['submission-a', 'submission-b'] },
        f.user,
        f.services as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(2, f.user, [Permission.EventAttendance.Update], {
      eventId: 'event-b',
    });
  });

  it('uses the owning service permission for a ticket purchase target', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'approveTicketPurchase',
      { purchaseId: 'purchase-a' },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.Receipt.Approve], {
      majorEventId: 'major-a',
    });
  });

  it('uses create or update permission for ticket configuration based on current state', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'saveTicketConfig',
      { input: { eventId: 'event-a' } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.TicketConfig.Create], {
      eventId: 'event-a',
    });

    f.prisma.ticketConfig.findUnique.mockResolvedValueOnce({ id: 'config-a' });
    await assertDynamicAdminMcpAdmission(
      'saveTicketConfig',
      { input: { eventId: 'event-a' } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenLastCalledWith(f.user, [Permission.TicketConfig.Update], {
      eventId: 'event-a',
    });
  });

  it('checks all event-form targets for create and edit operations', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'saveEventForm',
      { input: { name: 'Novo formulário', ownerEventId: 'event-new', links: [] } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.EventForm.Create], {
      eventId: 'event-new',
      majorEventId: undefined,
      allowScopedCollection: true,
    });

    f.policy.assertPermissions.mockClear();
    await assertDynamicAdminMcpAdmission(
      'saveEventForm',
      { input: { id: 'form-a', name: 'Editado', ownerEventId: 'event-new' } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(1, f.user, [Permission.EventForm.Update], {
      eventFormId: 'form-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(2, f.user, [Permission.EventForm.Update], {
      eventId: 'event-old',
      majorEventId: undefined,
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(3, f.user, [Permission.EventForm.Update], {
      eventId: 'event-new',
      majorEventId: undefined,
    });
  });

  it('checks the event form behind a draft save', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'saveEventFormDraft',
      { input: { sourceFormId: 'form-a', input: { name: 'Rascunho' } } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenCalledWith(f.user, [Permission.EventForm.Update], {
      eventFormId: 'form-a',
    });
  });

  it('checks dynamic prize-draw edit, target and personal-data permissions', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'savePrizeDraw',
      {
        input: {
          id: 'draw-a',
          targetType: PrizeDrawTargetType.EVENT,
          eventId: 'event-a',
          manualEntries: [{ personId: 'person-a' }],
          weightOverrides: [],
          excludedPersonIds: [],
        },
      },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(1, f.user, [Permission.PrizeDraw.Update], {
      prizeDrawId: 'draw-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(2, f.user, [Permission.PrizeDraw.Update], {
      eventId: 'event-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(3, f.user, [Permission.RelatedPerson.Read], {
      eventId: 'event-a',
    });
  });

  it('checks both certificate issuance grants against the actual configuration scope', async () => {
    const f = fixture();
    await assertDynamicAdminMcpAdmission(
      'requestCertificateIssuance',
      { input: { configId: 'config-a', reissue: true } },
      f.user,
      f.services as never,
    );
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(1, f.user, [Permission.Certificate.Issue], {
      scope: CertificateScope.EVENT,
      targetId: 'event-a',
      certificateConfigId: 'config-a',
    });
    expect(f.policy.assertPermissions).toHaveBeenNthCalledWith(2, f.user, [Permission.Certificate.Reissue], {
      scope: CertificateScope.EVENT,
      targetId: 'event-a',
      certificateConfigId: 'config-a',
    });
  });

  it('retains the native super-admin requirement for audit-log reversals', async () => {
    const f = fixture();
    await expect(
      assertDynamicAdminMcpAdmission(
        'revertAuditLogEntry',
        { input: { entryId: 'entry-a' } },
        f.user,
        f.services as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.policy.assertPermissions).not.toHaveBeenCalled();

    f.policy.isSuperAdmin.mockReturnValueOnce(true);
    await expect(
      assertDynamicAdminMcpAdmission(
        'revertAuditLogEntry',
        { input: { entryId: 'entry-a' } },
        f.user,
        f.services as never,
      ),
    ).resolves.toBeUndefined();
  });

  it('fails closed for an unregistered dynamic mutation', async () => {
    const f = fixture();
    await expect(assertDynamicAdminMcpAdmission('newDynamicMutation', {}, f.user, f.services as never)).rejects.toThrow(
      'Esta operação dinâmica não tem admissão autorizada.',
    );
  });
});
