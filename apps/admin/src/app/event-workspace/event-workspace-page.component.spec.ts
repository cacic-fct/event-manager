import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { SubscriptionApiService } from '../graphql/subscription-api.service';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { InterestApiService } from '../graphql/interest-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { createAdminEvent } from '../testing/admin-entity-fixtures';
import { EventWorkspaceContextService } from './event-workspace-context.service';
import { EventWorkspacePageComponent } from './event-workspace-page.component';

describe('event workspace child lists', () => {
  async function render(section?: string) {
    const events = Array.from({ length: 51 }, (_, index) => createAdminEvent({ id: `event-${index}` }));
    const listEvents = vi.fn(({ skip = 0, take = 50 }: { skip?: number; take?: number }) => of(events.slice(skip, skip + take)));
    const navigate = vi.fn().mockResolvedValue(true);
    const workspace = { context: signal(null), canReadActivities: () => true };
    TestBed.configureTestingModule({ providers: [
      { provide: ADMIN_SHELL_CONTEXT, useValue: true },
      { provide: ActivatedRoute, useValue: {
        paramMap: of(convertToParamMap({ targetType: 'group', targetId: 'group-1', ...(section ? { section } : {}) })),
        snapshot: { data: {} },
      } },
      { provide: Router, useValue: { navigate } },
      { provide: MatDialog, useValue: {} },
      { provide: EventWorkspaceContextService, useValue: workspace },
      { provide: PermissionsService, useValue: { has: () => true } },
      { provide: EventApiService, useValue: { listEvents } },
      { provide: EventGroupApiService, useValue: {} },
      { provide: SubscriptionApiService, useValue: {} },
      { provide: AttendanceApiService, useValue: {} },
      { provide: InterestApiService, useValue: {} },
    ] }).overrideComponent(EventWorkspacePageComponent, { set: { template: '', imports: [] } });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(EventWorkspacePageComponent);
    await fixture.whenStable();
    return { fixture, listEvents, navigate };
  }

  it('collects all child pages instead of exposing nested pagination', async () => {
    const { fixture, listEvents } = await render();
    const component = fixture.componentInstance as unknown as { loadActivities(): Promise<void>; activities(): { id: string }[] };
    await component.loadActivities();
    expect(component.activities()).toHaveLength(51);
    expect(component.activities().at(-1)?.id).toBe('event-50');
    expect(listEvents).toHaveBeenCalledWith({ eventGroupId: 'group-1', skip: 50, take: 50 });
  });

  it('does not fetch the overview child lists when opening settings', async () => {
    const { listEvents } = await render('settings');
    expect(listEvents).not.toHaveBeenCalled();
  });

  it.each([
    ['event', 'event-1'],
    ['group', 'group-1'],
    ['major-event', 'major-event-1'],
  ] as const)('opens the selected %s context in settings', async (kind, id) => {
    const { fixture, navigate } = await render();
    const component = fixture.componentInstance as unknown as {
      contextRoute(ref: { kind: 'event' | 'group' | 'major-event'; id: string }): string[];
      selectContext(ref: { kind: 'event' | 'group' | 'major-event'; id: string }): void;
    };

    expect(component.contextRoute({ kind, id })).toEqual(['/event-workspace', kind, id, 'settings']);
    component.selectContext({ kind, id });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/event-workspace', kind, id, 'settings']);
  });
});
