import { describe, expect, it } from 'vitest';
import { WORKSPACE_TAB_PERMISSIONS } from '@cacic-fct/shared-permissions';

import { findNavigationItemForUrl, globalNavigationItems, navigationItems } from './navigation';

describe('workspace nav', () => {
  it('keeps resource operations out of the global menu while retaining the event shortcut', () => {
    const linkIds = globalNavigationItems.filter((item) => item.kind === 'link').map((item) => item.id);

    expect(linkIds).toEqual([
      'dashboard', 'events', 'certificates', 'people', 'merge-candidates',
      'notifications', 'places', 'global-operations', 'permissions', 'audit-logs', 'preferences',
    ]);
  });

  it('does not match dividers as active nav items', () => {
    expect(findNavigationItemForUrl('/').id).toBe('dashboard');
    expect(findNavigationItemForUrl('/workspace/subscriptions').id).toBe('subscriptions');
    expect(findNavigationItemForUrl('/workspace/attendances/event/event-1').id).toBe('attendances');
    expect(findNavigationItemForUrl('/workspace/permissions?tab=scopes').id).toBe('permissions');
    expect(findNavigationItemForUrl('/workspace/preferences').id).toBe('preferences');
  });

  it('maps scope homes to the correct permission owner', () => {
    expect(findNavigationItemForUrl('/event-workspace').id).toBe('events');
    expect(findNavigationItemForUrl('/event-workspace/event/event-1').id).toBe('events');
    expect(findNavigationItemForUrl('/admin/event-workspace/group/group-1').id).toBe('groups');
    expect(findNavigationItemForUrl('/event-workspace/major-event/major-1?view=activities').id).toBe('major-events');
  });

  it('preserves operation ownership for compatible scoped URLs', () => {
    expect(findNavigationItemForUrl('/subscriptions/event/event-1/interests').id).toBe('subscriptions');
    expect(findNavigationItemForUrl('/subscriptions/group/group-1/interests').id).toBe('subscriptions');
    expect(findNavigationItemForUrl('/attendances/major-event/major-1').id).toBe('attendances');
  });

  it('uses unique ids for repeated divider entries', () => {
    const dividerIds = navigationItems.filter((item) => item.kind === 'divider').map((item) => item.id);

    expect(new Set(dividerIds).size).toBe(dividerIds.length);
  });

  it('backs every nav link with a shared permission tab', () => {
    const permissionTabIds = new Set(WORKSPACE_TAB_PERMISSIONS.map((tab) => tab.id));
    const linkIds = navigationItems.filter((item) => item.kind === 'link').map((item) => item.id);

    expect(linkIds.every((id) => permissionTabIds.has(id))).toBe(true);
    expect(new Set(linkIds).size).toBe(linkIds.length);
  });
});
