import { REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { EventSubscriptionsResolver } from './subscriptions.resolver';

describe('EventSubscriptionsResolver', () => {
  it('requires every read permission needed by nested workspace subscription payloads', () => {
    const requiredReadScopes = ['subscription#read', 'event#read', 'major-event#read', 'person#read'];

    expect(
      Reflect.getMetadata(REQUIRED_ROLES_KEY, EventSubscriptionsResolver.prototype.workspaceEventSubscriptions),
    ).toEqual(requiredReadScopes);
    expect(
      Reflect.getMetadata(REQUIRED_ROLES_KEY, EventSubscriptionsResolver.prototype.workspaceMajorEventSubscriptions),
    ).toEqual(requiredReadScopes);
  });

  it('requires nested entity read permissions when mutation responses return hydrated subscriptions', () => {
    expect(
      Reflect.getMetadata(REQUIRED_ROLES_KEY, EventSubscriptionsResolver.prototype.createWorkspaceEventSubscription),
    ).toEqual(['subscription#edit', 'event#read', 'person#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_ROLES_KEY,
        EventSubscriptionsResolver.prototype.createWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#edit', 'event#read', 'major-event#read', 'person#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_ROLES_KEY,
        EventSubscriptionsResolver.prototype.updateWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#edit', 'event#read', 'major-event#read', 'person#read']);
  });
});
