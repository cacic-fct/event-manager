import { toCertificateCatalogItem } from './certificate-catalog';

describe('certificate selection targets', () => {
  const certificate = (config: object) => ({
    id: 'certificate-1',
    configId: 'config-1',
    issuedAt: new Date(Date.now() - 60000),
    certificateTemplate: { id: 'template-1', name: 'Modelo' },
    config: {
      id: 'config-1',
      name: 'Participação',
      scope: 'EVENT',
      certificateText: null,
      certificateTemplate: { id: 'template-1', name: 'Modelo' },
      eventId: null,
      eventGroupId: null,
      majorEventId: null,
      folderId: null,
      eventGroup: null,
      event: null,
      ...config,
    },
  });

  it.each([
    [{ scope: 'MAJOR_EVENT', majorEventId: 'major' }, 'major-event', 'major'],
    [{ scope: 'EVENT_GROUP', eventGroupId: 'group', eventGroup: { majorEventId: 'major' } }, 'major-event', 'major'],
    [
      { eventId: 'child', event: { majorEventId: 'major', eventGroupId: 'group', eventGroup: null } },
      'major-event',
      'major',
    ],
    [
      { eventId: 'child', event: { majorEventId: null, eventGroupId: 'group', eventGroup: { majorEventId: 'major' } } },
      'major-event',
      'major',
    ],
    [{ scope: 'EVENT_GROUP', eventGroupId: 'group' }, 'event-group', 'group'],
    [
      { eventId: 'child', event: { majorEventId: null, eventGroupId: 'group', eventGroup: null } },
      'event-group',
      'group',
    ],
    [{ eventId: 'event' }, 'event', 'event'],
    [{ scope: 'OTHER', folderId: 'folder' }, 'folder', 'folder'],
    [{ scope: 'OTHER' }, 'folder', 'config-1'],
    [{ scope: 'EVENT' }, 'folder', 'config-1'],
  ])(
    'groups owned historical and current certificates under the correct attendance row',
    (config, targetType, targetId) => {
      const result = toCertificateCatalogItem(certificate(config as object) as never);
      expect(result).toEqual(expect.objectContaining({ targetType, targetId }));
      expect(result.certificate.id).toBe('certificate-1');
    },
  );
});
