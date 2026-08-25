import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { PublicationResolver } from './publishing.resolver';
import type { PublicationBulkInput, PublicationPreviewInput, PublicationStateInput } from './publishing.models';
import { PublicationBulkOperation } from './publishing.models';
import type { PublicationService } from './publishing.service';

describe('PublicationResolver', () => {
  const context = { req: { user: { sub: 'admin-1' } } };
  const publication = {
    getWorkspace: jest.fn(),
    setPublicationState: jest.fn(),
    runBulkOperation: jest.fn(),
    createPreview: jest.fn(),
    getPreviewPayload: jest.fn(),
  };
  const resolver = new PublicationResolver(publication as unknown as PublicationService);

  beforeEach(() => jest.clearAllMocks());

  it('forwards every workspace filter, pagination value, and focus target', async () => {
    const expected = { roots: [], total: 0 };
    publication.getWorkspace.mockResolvedValueOnce(expected);

    await expect(
      resolver.publicationWorkspace(context, 'congresso', 20, 10, PublicationTargetType.MAJOR_EVENT, 'major-1'),
    ).resolves.toBe(expected);
    expect(publication.getWorkspace).toHaveBeenCalledWith(context, {
      query: 'congresso',
      skip: 20,
      take: 10,
      focusTargetType: PublicationTargetType.MAJOR_EVENT,
      focusTargetId: 'major-1',
    });
  });

  it('preserves omitted workspace filters instead of inventing defaults', async () => {
    publication.getWorkspace.mockResolvedValueOnce({ roots: [], total: 0 });

    await resolver.publicationWorkspace(context);

    expect(publication.getWorkspace).toHaveBeenCalledWith(context, {
      query: undefined,
      skip: undefined,
      take: undefined,
      focusTargetType: undefined,
      focusTargetId: undefined,
    });
  });

  it('forwards state, bulk, and preview mutations with their authenticated context', async () => {
    const stateInput = {
      targetType: PublicationTargetType.EVENT,
      targetId: 'event-1',
      state: PublicationState.PUBLISHED,
    } as PublicationStateInput;
    const bulkInput = {
      targetType: PublicationTargetType.MAJOR_EVENT,
      targetId: 'major-1',
      operation: PublicationBulkOperation.PUBLISH_MISSING_CHILDREN,
    } as PublicationBulkInput;
    const previewInput = {
      targetType: PublicationTargetType.EVENT_GROUP,
      targetId: 'group-1',
    } as PublicationPreviewInput;
    publication.setPublicationState.mockResolvedValueOnce({ changed: true });
    publication.runBulkOperation.mockResolvedValueOnce({ changed: true });
    publication.createPreview.mockResolvedValueOnce({ previewToken: 'token-1' });

    await expect(resolver.setPublicationState(stateInput, context)).resolves.toEqual({ changed: true });
    await expect(resolver.runPublicationBulkOperation(bulkInput, context)).resolves.toEqual({ changed: true });
    await expect(resolver.createPublicationPreview(previewInput, context)).resolves.toEqual({
      previewToken: 'token-1',
    });

    expect(publication.setPublicationState).toHaveBeenCalledWith(stateInput, context);
    expect(publication.runBulkOperation).toHaveBeenCalledWith(bulkInput, context);
    expect(publication.createPreview).toHaveBeenCalledWith(previewInput, context);
  });

  it('loads a public preview only by its opaque token', async () => {
    const expected = { expiresAt: publicFixtureDateFromNow(1), event: { id: 'event-1' } };
    publication.getPreviewPayload.mockResolvedValueOnce(expected);

    await expect(resolver.publicationPreview('opaque-preview-token')).resolves.toBe(expected);
    expect(publication.getPreviewPayload).toHaveBeenCalledWith('opaque-preview-token');
  });

  it('does not swallow service validation or authorization errors', async () => {
    publication.setPublicationState.mockRejectedValueOnce(new Error('Transição inválida.'));

    await expect(
      resolver.setPublicationState(
        {
          targetType: PublicationTargetType.EVENT,
          targetId: 'event-1',
          state: PublicationState.PUBLISHED,
        } as PublicationStateInput,
        context,
      ),
    ).rejects.toThrow('Transição inválida.');
  });
});
