import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { PUBLIC_APP_ORIGIN } from './publishing.constants';

export function previewRedisKey(previewToken: string): string {
  return `publication-preview:${previewToken}`;
}

export function previewPath(targetType: PublicationTargetType, previewToken: string): string {
  if (targetType === PublicationTargetType.MAJOR_EVENT) {
    return `/preview/${previewToken}/major-event`;
  }
  if (targetType === PublicationTargetType.EVENT_GROUP) {
    return `/preview/${previewToken}/group`;
  }
  return `/preview/${previewToken}/event`;
}

export function publicUrl(path: string): string {
  return new URL(path, PUBLIC_APP_ORIGIN).toString();
}
