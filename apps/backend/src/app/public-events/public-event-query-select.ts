import type { GraphQLResolveInfo } from 'graphql';
import { graphqlFieldRequested } from '../common/graphql-field-requested';
import { PUBLIC_EVENT_SELECT } from './models';

/** Keep resolver dependencies, but avoid loading large content and unrequested relations. */
export function publicEventQuerySelect(info?: GraphQLResolveInfo) {
  return {
    ...PUBLIC_EVENT_SELECT,
    description: graphqlFieldRequested(info, ['description']),
    shortDescription: graphqlFieldRequested(info, ['shortDescription']),
    majorEvent: graphqlFieldRequested(info, ['majorEvent']) ? PUBLIC_EVENT_SELECT.majorEvent : false,
    eventGroup: graphqlFieldRequested(info, ['eventGroup']) ? PUBLIC_EVENT_SELECT.eventGroup : false,
    sportsMatch: graphqlFieldRequested(info, ['sportsMatch']) ? PUBLIC_EVENT_SELECT.sportsMatch : false,
  };
}
