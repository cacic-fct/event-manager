import type { PublicEventForm, PublicEventFormLink } from '@cacic-fct/event-manager-public-contracts';

export function arePublicFormResultsReleased(
  form: Pick<PublicEventForm, 'resultsPublic' | 'resultsLive'>,
  link: Pick<PublicEventFormLink, 'availableFrom' | 'availableUntil'>,
  now = new Date(),
): boolean {
  if (!form.resultsPublic) {
    return false;
  }

  if (isPublicFormLinkClosed(link, now)) {
    return true;
  }

  return form.resultsLive && hasPublicFormLinkStarted(link, now);
}

export function isPublicFormLinkAvailable(
  link: Pick<PublicEventFormLink, 'availableFrom' | 'availableUntil'>,
  now = new Date(),
): boolean {
  return hasPublicFormLinkStarted(link, now) && !isPublicFormLinkClosed(link, now);
}

export function hasPublicFormLinkStarted(
  link: Pick<PublicEventFormLink, 'availableFrom'>,
  now = new Date(),
): boolean {
  const availableFrom = toDate(link.availableFrom);
  return !availableFrom || availableFrom.getTime() <= now.getTime();
}

export function isPublicFormLinkClosed(
  link: Pick<PublicEventFormLink, 'availableUntil'>,
  now = new Date(),
): boolean {
  const availableUntil = toDate(link.availableUntil);
  return Boolean(availableUntil && availableUntil.getTime() <= now.getTime());
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
