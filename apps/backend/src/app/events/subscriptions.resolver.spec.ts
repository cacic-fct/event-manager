import { Permission, getPermissionIncludedDataSummary } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventSubscriptionsResolver } from './subscriptions.resolver';

describe('EventSubscriptionsResolver', () => {
  it('requires workflow read permissions without inheriting full person read access', () => {
    const requiredReadScopes = ['subscription#read', 'event#read', 'major-event#read'];

    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventSubscriptionsResolver.prototype.workspaceEventSubscriptions),
    ).toEqual(requiredReadScopes);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.workspaceMajorEventSubscriptions,
      ),
    ).toEqual(requiredReadScopes);
  });

  it('requires workflow permissions when mutation responses return contextual limited person data', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.createWorkspaceEventSubscription,
      ),
    ).toEqual(['subscription#create', 'event#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.createWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#create', 'event#read', 'major-event#read']);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        EventSubscriptionsResolver.prototype.updateWorkspaceMajorEventSubscription,
      ),
    ).toEqual(['subscription#update', 'event#read', 'major-event#read']);
  });

  it('documents the limited person data carried by subscription permissions', () => {
    expect(getPermissionIncludedDataSummary(Permission.Subscription.Read)).toContain(
      'Dados limitados da pessoa inscrita',
    );
    expect(getPermissionIncludedDataSummary(Permission.Subscription.Create)).toContain(
      'Identificação da pessoa inscrita',
    );
  });
});
