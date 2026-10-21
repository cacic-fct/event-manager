import type { TransferResource } from '@cacic-fct/shared-data-transfer';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import {
  normalizeEventTreeTransferResource,
  validateTransferAudienceAndPublication,
} from './event-tree-transfer-policy';
const { jest } = import.meta;

const hour = 60 * 60 * 1000;

function fixture(data: Record<string, unknown>, previous: Record<string, unknown> = {}) {
  const resource = { kind: 'event', id: 'event-1', data } as TransferResource;
  const current = { kind: 'event', id: 'event-1', data: { audience: 'PUBLIC', ...previous } } as TransferResource;
  const snapshot: ResolvedTransferResource = {
    resource: normalizeEventTreeTransferResource(resource, current),
    current,
    revision: new Date().toISOString(),
    scope: { eventId: resource.id },
    dependencies: [],
  };
  const tx = {
    people: { findMany: jest.fn().mockResolvedValue([{ id: 'person-1' }]) },
    eventGroup: { findFirst: jest.fn().mockResolvedValue(null) },
    majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const context: TransferAdapterContext = {
    tx: tx as never,
    actor: { sub: 'organizer-1' },
    frozenResources: {} as never,
    document: { format: 'cacic-event-data', version: 1, resources: [snapshot.resource] },
  };
  return { snapshot, context, tx };
}

describe('event transfer audience and publication policies', () => {
  it('preserves omitted publication and invitation fields', () => {
    const resource: TransferResource = { kind: 'event', id: 'event-1', data: { name: 'Novo nome' } };
    expect(normalizeEventTreeTransferResource(resource, null)).toEqual(resource);
  });

  it('clears obsolete lifecycle dates and retains a supplied historical publication date', () => {
    const publishedAt = new Date(Date.now() - hour).toISOString();
    const { snapshot } = fixture(
      { publicationState: 'PUBLISHED', publishedAt },
      {
        publicationState: 'SCHEDULED',
        scheduledPublishAt: new Date(Date.now() + hour).toISOString(),
      },
    );
    expect(snapshot.resource.data).toEqual({
      publicationState: 'PUBLISHED',
      publishedAt,
      scheduledPublishAt: null,
      unpublishedAt: null,
    });
  });

  it.each([null, new Date(Date.now() - hour).toISOString()])(
    'rejects an invalid schedule: %s',
    async (scheduledPublishAt) => {
      const { snapshot, context } = fixture({ publicationState: 'SCHEDULED', scheduledPublishAt });
      await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('futuro');
    },
  );

  it('accepts a future schedule and rejects dates incompatible with its state', async () => {
    const { snapshot, context } = fixture({
      publicationState: 'SCHEDULED',
      scheduledPublishAt: new Date(Date.now() + hour).toISOString(),
    });
    await expect(validateTransferAudienceAndPublication(snapshot, context)).resolves.toBeUndefined();
    expect(() => fixture({ publicationState: 'DRAFT', publishedAt: new Date().toISOString() })).toThrow(
      'incompatíveis',
    );
  });

  it('rejects clearing a schedule without changing the scheduled state', async () => {
    const { snapshot, context } = fixture(
      { scheduledPublishAt: null },
      {
        publicationState: 'SCHEDULED',
        scheduledPublishAt: new Date(Date.now() + hour).toISOString(),
      },
    );
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('futuro');
  });

  it('validates active destination people before replacing invitations', async () => {
    const { snapshot, context, tx } = fixture({ invitationPersonIds: ['missing-person'] });
    tx.people.findMany.mockResolvedValue([]);
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('ativas');
    expect(tx.people.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['missing-person'] }, deletedAt: null, mergedIntoId: null },
      select: { id: true },
    });
  });

  it.each(['PUBLISHED', 'SCHEDULED'])('requires invitees for an invitation-only %s record', async (state) => {
    const { snapshot, context } = fixture({
      publicationState: state,
      audience: 'INVITATION_ONLY',
      invitationPersonIds: [],
      ...(state === 'SCHEDULED' ? { scheduledPublishAt: new Date(Date.now() + hour).toISOString() } : {}),
    });
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('convidada');
  });

  it('accepts publishing with valid audience and attendance invitees in the same row', async () => {
    const { snapshot, context } = fixture({
      publicationState: 'PUBLISHED',
      audience: 'INVITATION_ONLY',
      attendanceEligibility: 'INVITED_ONLY',
      invitationPersonIds: ['person-1'],
    });
    await expect(validateTransferAudienceAndPublication(snapshot, context)).resolves.toBeUndefined();
  });

  it('checks inherited audiences and attendance policy against executable parents', async () => {
    const { snapshot, context, tx } = fixture({ publicationState: 'PUBLISHED' }, { eventGroupId: 'group-1' });
    tx.eventGroup.findFirst.mockResolvedValue({ audience: 'INVITATION_ONLY', audienceInvitations: [] } as never);
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('convidada');
    context.document.resources.push({ kind: 'group', id: 'group-1', data: { invitationPersonIds: ['person-1'] } });
    await expect(validateTransferAudienceAndPublication(snapshot, context)).resolves.toBeUndefined();
    // A blocked parent is excluded from the partial plan; its proposed invitees cannot justify publication.
    context.document.resources.pop();
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('convidada');
  });

  it("inherits invited-only attendance from a group's major event", async () => {
    const { snapshot, context, tx } = fixture({ publicationState: 'PUBLISHED' }, { eventGroupId: 'group-1' });
    tx.eventGroup.findFirst.mockResolvedValue({
      audience: 'PUBLIC',
      audienceInvitations: [],
      attendanceEligibility: null,
      majorEventId: 'major-1',
    } as never);
    tx.majorEvent.findFirst.mockResolvedValue({
      audience: 'PUBLIC',
      audienceInvitations: [],
      attendanceEligibility: 'INVITED_ONLY',
    } as never);
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('confirmar presença');
  });

  it('prevents removing the final invitee from a published record', async () => {
    const { snapshot, context, tx } = fixture(
      { invitationPersonIds: [] },
      {
        publicationState: 'PUBLISHED',
        audience: 'INVITATION_ONLY',
        invitationPersonIds: ['person-1'],
      },
    );
    tx.people.findMany.mockResolvedValue([]);
    await expect(validateTransferAudienceAndPublication(snapshot, context)).rejects.toThrow('convidada');
  });
});
