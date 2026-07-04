import { EventForm, EventFormLink } from '@cacic-fct/shared-data-types';
import { EventFormLinkRecord, EventFormRecord } from './event-form-records';

type ResultVisibilityForm = Pick<EventForm | EventFormRecord, 'resultsPublic' | 'resultsLive'>;
type ResultVisibilityLink = Pick<EventFormLink | EventFormLinkRecord, 'availableFrom' | 'availableUntil'>;

export function arePublicResultsReleasedForLink(
  form: ResultVisibilityForm,
  link: ResultVisibilityLink,
  now = new Date(),
): boolean {
  if (!form.resultsPublic) {
    return false;
  }

  if (isEventFormLinkClosed(link, now)) {
    return true;
  }

  return form.resultsLive && hasEventFormLinkStarted(link, now);
}

export function hasEventFormLinkStarted(link: ResultVisibilityLink, now = new Date()): boolean {
  const availableFrom = toDate(link.availableFrom);
  return !availableFrom || availableFrom.getTime() <= now.getTime();
}

export function isEventFormLinkClosed(link: ResultVisibilityLink, now = new Date()): boolean {
  const availableUntil = toDate(link.availableUntil);
  return Boolean(availableUntil && availableUntil.getTime() <= now.getTime());
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
