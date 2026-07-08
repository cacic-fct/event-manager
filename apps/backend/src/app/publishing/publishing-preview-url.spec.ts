import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { previewPath, previewRedisKey, publicUrl } from './publishing-preview-url';

describe('publishing preview urls', () => {
  it('builds stable Redis keys for preview tokens', () => {
    expect(previewRedisKey('preview-token')).toBe('publication-preview:preview-token');
  });

  it.each([
    [PublicationTargetType.EVENT, '/preview/preview-token/event'],
    [PublicationTargetType.EVENT_GROUP, '/preview/preview-token/group'],
    [PublicationTargetType.MAJOR_EVENT, '/preview/preview-token/major-event'],
  ])('builds preview paths for %s targets', (targetType, expectedPath) => {
    expect(previewPath(targetType, 'preview-token')).toBe(expectedPath);
  });

  it('builds public urls from preview paths', () => {
    expect(publicUrl('/preview/preview-token/event')).toBe('http://localhost:4200/preview/preview-token/event');
  });
});
