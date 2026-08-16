import { Permission } from '@cacic-fct/shared-permissions';
import { ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventDraftsResolver } from './event-drafts.resolver';

describe('EventDraftsResolver', () => {
  const actor = { sub: 'admin-1' };
  const drafts = {
    listEventDrafts: jest.fn(),
    saveEventDraft: jest.fn(),
    applyEventDraft: jest.fn(),
    deleteEventDraft: jest.fn(),
    deleteEventDraftsForEvent: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('allows scoped collection authorization while requiring event update for every operation', () => {
    for (const operation of [
      'eventDrafts',
      'saveEventDraft',
      'applyEventDraft',
      'deleteEventDraft',
      'deleteEventDraftsForEvent',
    ] as const) {
      expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventDraftsResolver.prototype[operation])).toEqual([
        Permission.Event.Update,
      ]);
      expect(
        Reflect.getMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, EventDraftsResolver.prototype[operation]),
      ).toBe(true);
    }
  });

  it('forwards list filters and both GraphQL actor context shapes', async () => {
    const expected = [{ id: 'draft-1' }];
    drafts.listEventDrafts.mockResolvedValue(expected);
    const subject = resolver();

    await expect(subject.eventDrafts({ req: { user: actor } }, 'event-1', ['event-1', 'event-2'])).resolves.toBe(
      expected,
    );
    expect(drafts.listEventDrafts).toHaveBeenLastCalledWith(actor, {
      sourceEventId: 'event-1',
      sourceEventIds: ['event-1', 'event-2'],
    });

    await subject.eventDrafts({ request: { user: actor } });
    expect(drafts.listEventDrafts).toHaveBeenLastCalledWith(actor, {
      sourceEventId: undefined,
      sourceEventIds: undefined,
    });
  });

  it('delegates save, apply, individual delete, and source-event delete without changing payloads', async () => {
    const input = { sourceEventId: 'event-1', draftJson: '{"name":"Rascunho"}' };
    drafts.saveEventDraft.mockResolvedValueOnce({ id: 'draft-1' });
    drafts.applyEventDraft.mockResolvedValueOnce({ id: 'event-1' });
    drafts.deleteEventDraft.mockResolvedValueOnce({ deleted: true, id: 'draft-1' });
    drafts.deleteEventDraftsForEvent.mockResolvedValueOnce({ deleted: true, id: 'event-1' });
    const subject = resolver();

    await subject.saveEventDraft(input as never, { req: { user: actor } });
    await subject.applyEventDraft('draft-1', { req: { user: actor } });
    await subject.deleteEventDraft('draft-1', { req: { user: actor } });
    await subject.deleteEventDraftsForEvent('event-1', { req: { user: actor } });

    expect(drafts.saveEventDraft).toHaveBeenCalledWith(input, actor);
    expect(drafts.applyEventDraft).toHaveBeenCalledWith('draft-1', actor);
    expect(drafts.deleteEventDraft).toHaveBeenCalledWith('draft-1', actor);
    expect(drafts.deleteEventDraftsForEvent).toHaveBeenCalledWith('event-1', actor);
  });

  it('propagates service validation failures', async () => {
    drafts.applyEventDraft.mockRejectedValueOnce(new Error('Rascunho desatualizado.'));

    await expect(resolver().applyEventDraft('draft-1', { req: { user: actor } })).rejects.toThrow(
      'Rascunho desatualizado.',
    );
  });

  function resolver(): EventDraftsResolver {
    return new EventDraftsResolver(drafts as never);
  }
});
