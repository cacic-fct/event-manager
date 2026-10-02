import { Injector, Service, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Event, EventGroup, MajorEvent } from '@cacic-fct/event-manager-admin-contracts';
import { SportsApiService } from '../sports/sports-api.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { NavigationLinkId } from '../app-shell/navigation';
import { adminEventWorkspaceCreationRoute, adminEventWorkspaceRoute, adminSportsWorkspaceRoute, type AdminEventWorkspaceKind } from '@cacic-fct/shared-utils';

export type EventWorkspaceKind = AdminEventWorkspaceKind;
export interface EventWorkspaceRef { kind: EventWorkspaceKind; id: string }
export interface EventWorkspaceParent extends EventWorkspaceRef { name: string; emoji: string }
export interface EventWorkspaceContext extends EventWorkspaceRef {
  parent?: EventWorkspaceParent | null;
  name: string;
  emoji: string;
  startDate?: string;
  endDate?: string;
  majorEventId?: string | null;
  isSportsManaged?: boolean;
}
export interface ContextOperation {
  id: 'overview' | 'settings' | 'sports' | 'subscriptions' | 'attendances' | 'forms' | 'draws' | 'interests' | 'certificates' | 'publication';
  label: string;
  icon: string;
  path: string[];
  permissionTab: NavigationLinkId;
  queryParams?: Record<string, string>;
}

export function eventContextFromUrl(url: string): EventWorkspaceRef | null {
  let segments: string[];
  try {
    segments = url.split(/[?#]/)[0].split('/').filter(Boolean).map((segment) => decodeURIComponent(segment.split(';')[0]));
  } catch {
    return null;
  }
  if (segments[0] === 'admin') segments.shift();
  const [section, kind, id] = segments;
  const query = new URLSearchParams(url.split('?')[1]?.split('#')[0]);
  if (section === 'event-workspace' && kind === 'new') {
    const groupId = query.get('eventGroupId');
    const majorId = query.get('majorEventId');
    if (groupId) return { kind: 'group', id: groupId };
    if (majorId) return { kind: 'major-event', id: majorId };
    return null;
  }
  if (section === 'event-workspace' && id && ['event', 'group', 'major-event'].includes(kind)) {
    return { kind: kind as EventWorkspaceKind, id };
  }
  if (['subscriptions', 'attendances', 'forms', 'certificates', 'publication'].includes(section) && id) {
    if (kind === 'event' || kind === 'major-event') return { kind, id };
    if (kind === 'group' || kind === 'event-group') return { kind: 'group', id };
  }
  if (section === 'sports' && kind === 'major-event' && id) return { kind: 'major-event', id };
  if (section === 'draws' || section === 'forms') {
    const eventId = query.get('eventId');
    const majorEventId = query.get('majorEventId');
    if (eventId) return { kind: 'event', id: eventId };
    if (majorEventId) return { kind: 'major-event', id: majorEventId };
  }
  return null;
}

export function contextOperations(context: EventWorkspaceRef): ContextOperation[] {
  const { kind, id } = context;
  const targetType = kind === 'group' ? 'event-group' : kind;
  const operations: ContextOperation[] = kind === 'event' ? [] : [
    { id: 'overview', label: 'Visão geral', icon: 'space_dashboard', path: adminEventWorkspaceRoute(context), permissionTab: kind === 'group' ? 'groups' : 'major-events' },
  ];
  operations.push({ id: 'settings', label: 'Configurações', icon: 'settings', path: adminEventWorkspaceRoute({ ...context, section: 'settings' }), permissionTab: kind === 'group' ? 'groups' : kind === 'event' ? 'events' : 'major-events' });
  if (kind !== 'group') {
    operations.push(
      { id: 'subscriptions', label: 'Inscrições', icon: 'how_to_reg', path: ['/subscriptions', kind, id], permissionTab: 'subscriptions' },
      { id: 'attendances', label: 'Presenças', icon: 'fact_check', path: ['/attendances', kind, id], permissionTab: 'attendances' },
      { id: 'forms', label: 'Formulários', icon: 'list_alt', path: ['/forms', kind, id], permissionTab: 'forms' },
      { id: 'draws', label: 'Sorteios', icon: 'rewarded_ads', path: ['/draws'], queryParams: { [kind === 'event' ? 'eventId' : 'majorEventId']: id }, permissionTab: 'prize-draws' },
    );
  }
  if (kind === 'major-event') operations.push({ id: 'sports', label: 'Esportes', icon: 'sports', path: adminSportsWorkspaceRoute({ majorEventId: id }), permissionTab: 'sports' });
  operations.push(
    { id: 'interests', label: 'Interessados', icon: 'bookmark_add', path: ['/subscriptions', kind, id, 'interests'], permissionTab: 'subscriptions' },
    { id: 'certificates', label: 'Certificados', icon: 'workspace_premium', path: ['/certificates', targetType, id], permissionTab: 'certificates' },
    { id: 'publication', label: 'Publicação', icon: 'campaign', path: ['/publication', targetType, id], permissionTab: 'publication' },
  );
  return operations;
}

export function eventCreationTarget(kind: EventWorkspaceKind, parent?: EventWorkspaceContext | null): { commands: string[]; queryParams?: Record<string, string> } {
  const queryParams: Record<string, string> = {};
  if (parent?.kind === 'major-event' && kind !== 'major-event') queryParams['majorEventId'] = parent.id;
  if (parent?.kind === 'group' && kind === 'event') {
    queryParams['eventGroupId'] = parent.id;
    if (parent.majorEventId) queryParams['majorEventId'] = parent.majorEventId;
  }
  return { commands: adminEventWorkspaceCreationRoute(kind), ...(Object.keys(queryParams).length ? { queryParams } : {}) };
}

@Service()
export class EventWorkspaceContextService {
  private readonly events = inject(EventApiService);
  private readonly groups = inject(EventGroupApiService);
  private readonly majors = inject(MajorEventApiService);
  private readonly permissions = inject(PermissionsService);
  private readonly injector = inject(Injector);
  private request = 0;
  private readonly navigationParents = new Map<string, EventWorkspaceParent>();
  readonly context = signal<EventWorkspaceContext | null>(null);
  readonly loading = signal(false);
  readonly scopeSwitchBlocked = signal(false);
  readonly error = signal('');
  readonly operations = computed(() => {
    const context = this.context();
    return context ? contextOperations(context).filter((operation) => this.permissions.canReadTab(operation.permissionTab)) : [];
  });

  async load(ref: EventWorkspaceRef | null): Promise<void> {
    const request = ++this.request;
    if (!ref) { this.context.set(null); this.error.set(''); this.loading.set(false); return; }
    if (this.context()?.kind !== ref.kind || this.context()?.id !== ref.id) this.context.set(null);
    this.loading.set(true);
    this.error.set('');
    try {
      if (ref.kind === 'major-event' && !this.permissions.has(Permission.MajorEvent.Read) && this.permissions.canReadTab('sports')) {
        const tournaments = await firstValueFrom(this.injector.get(SportsApiService).tournaments({ majorEventId: ref.id, take: 1 }));
        if (request !== this.request) return;
        const major = tournaments[0]?.majorEvent;
        if (!major) throw new Error('Context unavailable');
        this.context.set({ ...ref, name: major.name, emoji: major.emoji, startDate: major.startDate, endDate: major.endDate, parent: null });
        return;
      }
      let entity: Event | EventGroup | MajorEvent;
      if (ref.kind === 'event') entity = await firstValueFrom(this.events.getEvent(ref.id));
      else if (ref.kind === 'group') entity = await firstValueFrom(this.groups.getEventGroup(ref.id));
      else entity = await firstValueFrom(this.majors.getMajorEvent(ref.id));
      if (request !== this.request) return;
      this.context.set({ ...ref, name: entity.name, emoji: entity.emoji,
        ...('majorEventId' in entity ? { majorEventId: entity.majorEventId } : {}),
        isSportsManaged: ('isSportsCategory' in entity && entity.isSportsCategory === true) || ('isSportsMatch' in entity && entity.isSportsMatch === true),
        ...('startDate' in entity ? { startDate: entity.startDate, endDate: entity.endDate } : {}) });
      const parent = await this.loadParent(ref, entity);
      if (request === this.request) this.context.update((context) => context ? { ...context, parent } : context);
    } catch {
      if (request === this.request) this.error.set('Não foi possível abrir este contexto. Confira seu acesso e tente novamente.');
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  rememberNavigationParent(child: EventWorkspaceRef, parent: EventWorkspaceParent): void {
    if (child.kind !== 'group' || parent.kind !== 'major-event') return;
    const key = `${child.kind}:${child.id}`;
    this.navigationParents.delete(key);
    this.navigationParents.set(key, parent);
    if (this.navigationParents.size > 50) {
      const oldest = this.navigationParents.keys().next().value;
      if (oldest) this.navigationParents.delete(oldest);
    }
  }

  private async loadParent(ref: EventWorkspaceRef, entity: Event | EventGroup | MajorEvent): Promise<EventWorkspaceParent | null> {
    try {
      if (ref.kind === 'event' && 'eventGroupId' in entity && entity.eventGroupId && this.permissions.canReadTab('groups')) {
        const group = ('eventGroup' in entity ? entity.eventGroup : null)
          ?? await firstValueFrom(this.groups.getEventGroup(entity.eventGroupId));
        return { kind: 'group', id: group.id, name: group.name, emoji: group.emoji };
      }
      if (ref.kind !== 'major-event' && 'majorEventId' in entity && entity.majorEventId && this.permissions.canReadTab('major-events')) {
        const major = ('majorEvent' in entity ? entity.majorEvent : null)
          ?? await firstValueFrom(this.majors.getMajorEvent(entity.majorEventId));
        return { kind: 'major-event', id: major.id, name: major.name, emoji: major.emoji };
      }
    } catch {
      // Parent access may be narrower than child access; keep the selected child usable.
      return null;
    }
    const navigationParent = this.navigationParents.get(`${ref.kind}:${ref.id}`);
    return navigationParent && this.permissions.canReadTab('major-events') ? navigationParent : null;
  }

  canReadActivities(): boolean { return this.permissions.has(Permission.Event.Read); }
}
