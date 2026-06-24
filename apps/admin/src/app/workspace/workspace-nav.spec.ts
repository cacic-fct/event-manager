import { describe, expect, it } from 'vitest';

import { findWorkspaceNavItemForUrl, workspaceNavItems } from './workspace-nav';

describe('workspace nav', () => {
  it('does not match dividers as active nav items', () => {
    expect(findWorkspaceNavItemForUrl('/workspace/subscriptions').id).toBe('subscriptions');
    expect(findWorkspaceNavItemForUrl('/workspace/attendances/event/event-1').id).toBe('attendances');
    expect(findWorkspaceNavItemForUrl('/workspace/permissions?tab=scopes').id).toBe('permissions');
    expect(findWorkspaceNavItemForUrl('/workspace/preferences').id).toBe('preferences');
  });

  it('uses unique ids for repeated divider entries', () => {
    const dividerIds = workspaceNavItems.filter((item) => item.kind === 'divider').map((item) => item.id);

    expect(new Set(dividerIds).size).toBe(dividerIds.length);
  });
});
