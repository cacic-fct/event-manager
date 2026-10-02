import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { SubscriptionApiService } from '../graphql/subscription-api.service';
import { AttendanceApiService } from '../graphql/attendance-api.service';
import { InterestApiService } from '../graphql/interest-api.service';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EventsPageComponent } from '../events/events-page.component';
import { EventGroupsPageComponent } from '../event-groups/event-groups-page.component';
import { MajorEventsPageComponent } from '../major-events/major-events-page.component';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { Permission } from '@cacic-fct/shared-permissions';
import type { Event, EventGroup } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom } from 'rxjs';
import { EventContextPickerComponent } from '../shared/event-context-picker.component';
import { WorkspaceRecordComponent } from '../shared/workspace-record.component';
import { PermissionsService } from '../permissions/permissions.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventWorkspaceContextService, EventWorkspaceRef, eventCreationTarget, EventWorkspaceKind } from './event-workspace-context.service';
import { adminEventWorkspaceRoute } from '@cacic-fct/shared-utils';
import { canCreateEventContext } from '../shared/event-context-access';
import { EventsService } from '../events/events.service';
import { EventGroupsService } from '../event-groups/event-groups.service';
import { MajorEventsService } from '../major-events/major-events.service';
import { WorkspacePendingChangesService } from '../app-shell/workspace-pending-changes.service';

@Component({
  selector: 'app-event-workspace-page',
  imports: [ MatFormFieldModule, MatInputModule, ReactiveFormsModule, EventsPageComponent, EventGroupsPageComponent, MajorEventsPageComponent, DatePipe, RouterLink, MatButtonModule, MatDialogModule, MatIconModule, MatListModule, MatProgressBarModule,
    TwemojiComponent, EventContextPickerComponent, WorkspaceRecordComponent],
  templateUrl: './event-workspace-page.component.html',
  styleUrls: ['../app-shell/layout/page-layout.shared.scss', '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss', './event-workspace-page.component.scss'],
})
export class EventWorkspacePageComponent {
  protected readonly contextRoute = adminEventWorkspaceRoute;
  readonly workspace = inject(EventWorkspaceContextService);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly events = inject(EventApiService);
  private readonly groupsApi = inject(EventGroupApiService);
  private readonly subscriptions = inject(SubscriptionApiService);
  private readonly attendance = inject(AttendanceApiService);
  private readonly interests = inject(InterestApiService);
  private readonly eventsEditor = inject(EventsService);
  private readonly groupsEditor = inject(EventGroupsService);
  private readonly majorEventsEditor = inject(MajorEventsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);
  private readonly pendingRegistration = this.pendingChanges.register();
  protected readonly inShell = inject(ADMIN_SHELL_CONTEXT, { optional: true }) ?? false;
  protected readonly summary = signal<{ subscribers: number | null; attended: number | null; interested: number | null } | null>(null);
  private summaryRequest = 0;
  private readonly destroyRef = inject(DestroyRef);
  protected readonly selectedRef = signal<EventWorkspaceRef | null>(null);
  protected readonly activities = signal<Event[]>([]);
  protected readonly activitiesLoading = signal(false);
  protected readonly activitiesError = signal('');
  protected readonly groups = signal<EventGroup[]>([]);
  protected readonly query = new FormControl('', { nonNullable: true });
  protected readonly appliedQuery = signal('');
  protected readonly settingsPage = signal(false);
  private request = 0;

  constructor() {
    effect(() => {
      const ref = this.selectedRef();
      const pending = this.settingsPage() && ref
        ? ref.kind === 'event'
          ? this.eventsEditor.unsavedChanges()
          : ref.kind === 'group'
            ? this.groupsEditor.unsavedChanges()
            : this.majorEventsEditor.unsavedChanges()
        : false;
      this.pendingRegistration.set(pending);
    });
    this.destroyRef.onDestroy(() => this.pendingRegistration.destroy());
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const kind = params.get('targetType');
      const id = params.get('targetId');
      const ref: EventWorkspaceRef | null = id && (kind === 'event' || kind === 'group' || kind === 'major-event') ? { kind, id } : null;
      this.selectedRef.set(ref);
      this.settingsPage.set(kind === 'event' || params.get('section') === 'settings');
      this.query.setValue('');
      this.appliedQuery.set('');
      if (!this.inShell) void this.workspace.load(ref);
      void this.loadActivities();
      void this.loadSummary(ref);
    });
  }

  private async loadSummary(ref: EventWorkspaceRef | null): Promise<void> {
    const request = ++this.summaryRequest;
    this.summary.set(null);
    if (!ref || ref.kind !== 'event') return;
    const [subscribers, attended, interested] = await Promise.allSettled([
      this.permissions.has(Permission.Subscription.Read) ? firstValueFrom(this.subscriptions.countEventSubscriptions(ref.id)) : Promise.resolve(null),
      this.permissions.has(Permission.EventAttendance.Read) ? firstValueFrom(this.attendance.getEventAttendanceCount(ref.id, 'PRESENT')) : Promise.resolve(null),
      this.permissions.has(Permission.Subscription.Read) ? firstValueFrom(this.interests.countInterests('EVENT', ref.id)) : Promise.resolve(null),
    ]);
    if (request !== this.summaryRequest) return;
    this.summary.set({ subscribers: subscribers.status === 'fulfilled' ? subscribers.value : null,
      attended: attended.status === 'fulfilled' ? attended.value : null,
      interested: interested.status === 'fulfilled' ? interested.value : null });
  }

  protected canCreate(kind: EventWorkspaceKind): boolean {
    return canCreateEventContext(this.permissions, kind);
  }

  protected create(kind: EventWorkspaceKind): void {
    if (!canCreateEventContext(this.permissions, kind)) return;
    const target = eventCreationTarget(kind);
    void this.router.navigate(target.commands, { queryParams: target.queryParams });
  }

  protected applySearch(): void {
    this.appliedQuery.set(this.query.value.trim());
    void this.loadActivities();
  }

  protected selectChildContext(ref: EventWorkspaceRef): void {
    const parent = this.workspace.context();
    if (parent) this.workspace.rememberNavigationParent(ref, parent);
    this.selectContext(ref);
  }

  protected selectContext(ref: EventWorkspaceRef): void {
    void this.pendingChanges.navigate(() => this.router.navigate(adminEventWorkspaceRoute(ref)));
  }

  protected async loadActivities(): Promise<void> {
    const request = ++this.request;
    const ref = this.selectedRef();
    this.activities.set([]);
    this.groups.set([]);
    this.activitiesError.set('');
    if (!ref || ref.kind === 'event' || this.settingsPage()) { this.activitiesLoading.set(false); return; }
    this.activitiesLoading.set(true);
    try {
      const query = this.appliedQuery();
      const [values, groups] = await Promise.all([
        this.workspace.canReadActivities() ? this.loadAllChildren(request, (skip, take) => firstValueFrom(this.events.listEvents({
          ...(ref.kind === 'group' ? { eventGroupId: ref.id } : { majorEventId: ref.id, ...(!query ? { isInGroup: false } : {}) }),
          ...(query ? { query } : {}), skip, take,
        }))) : Promise.resolve([]),
        ref.kind === 'major-event' && this.permissions.has(Permission.EventGroup.Read)
          ? this.loadAllChildren(request, (skip, take) => firstValueFrom(this.groupsApi.listEventGroups({ majorEventId: ref.id, ...(query ? { query } : {}), skip, take })))
          : Promise.resolve([]),
      ]);
      if (request !== this.request) return;
      this.groups.set(groups);
      this.activities.set(values);
    } catch {
      if (request === this.request) this.activitiesError.set('Não foi possível carregar as atividades. Tente novamente.');
    } finally {
      if (request === this.request) this.activitiesLoading.set(false);
    }
  }

  private async loadAllChildren<T>(request: number, load: (skip: number, take: number) => Promise<T[]>): Promise<T[]> {
    const children: T[] = [];
    const take = 50;
    for (let skip = 0; ; skip += take) {
      const page = await load(skip, take);
      if (request !== this.request) return [];
      children.push(...page);
      if (page.length < take) return children;
    }
  }
}
