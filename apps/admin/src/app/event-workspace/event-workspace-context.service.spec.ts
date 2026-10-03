import { Permission } from '@cacic-fct/shared-permissions';
import { SportsApiService } from '../sports/sports-api.service';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { createAdminEvent, createAdminEventGroup, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { EventWorkspaceContextService, contextOperations, eventContextFromUrl, eventCreationTarget } from './event-workspace-context.service';

describe('event workspace routes', () => {
  it.each([
    ['/admin/event-workspace/event/event%2Fwith%20space/settings', 'event', 'event/with space'],
    ['/event-workspace/event/e1;version=draft/settings', 'event', 'e1'],
    ['/attendances/major-event/m1/person/p1', 'major-event', 'm1'],
    ['/event-workspace/new/event?eventGroupId=g1&majorEventId=m1', 'group', 'g1'],
    ['/event-workspace/new/group?majorEventId=m1', 'major-event', 'm1'],
    ['/sports/major-event/m1/matches', 'major-event', 'm1'],
    ['/event-workspace/event/e1', 'event', 'e1'],
    ['/admin/event-workspace/group/g1', 'group', 'g1'],
    ['/event-workspace/major-event/m1/settings', 'major-event', 'm1'],
    ['/event-workspace/group/g1/settings', 'group', 'g1'],
    ['/event-workspace/event/e1/settings', 'event', 'e1'],
    ['/subscriptions/event/e1/interests', 'event', 'e1'],
    ['/subscriptions/group/g1/interests', 'group', 'g1'],
    ['/subscriptions/major-event/m1/subscription/s1', 'major-event', 'm1'],
    ['/tickets/event/e1', 'event', 'e1'],
    ['/tickets/major-event/m1', 'major-event', 'm1'],
    ['/attendances/event/e1/oral', 'event', 'e1'],
    ['/certificates/event-group/g1/config1', 'group', 'g1'],
    ['/publication/event-group/g1', 'group', 'g1'],
    ['/draws?majorEventId=m1', 'major-event', 'm1'],
    ['/draws/draw-1?eventId=e1', 'event', 'e1'],
    ['/forms/form-1?eventId=e1', 'event', 'e1'],
    ['/forms/form-1?majorEventId=m1', 'major-event', 'm1'],
  ])('recognizes the actual context in %s', (url, kind, id) => {
    expect(eventContextFromUrl(url)).toEqual({ kind, id });
  });

  it('gives contextual operations stable unique identifiers', () => {
    const operations = contextOperations({kind:'event',id:'e1'});
    expect(operations.map((operation)=>operation.id)).toEqual(['settings','tickets','subscriptions','attendances','forms','draws','interests','certificates','publication']);
    expect(new Set(operations.map((operation)=>operation.id)).size).toBe(operations.length);
  });

  it('offers sports only from its owning major event', () => {
    expect(contextOperations({kind:'major-event', id:'m1'}).find((item) => item.id === 'sports')?.path).toEqual(['/sports','major-event','m1']);
    expect(contextOperations({kind:'event', id:'e1'}).some((item) => item.id === 'sports')).toBe(false);
    expect(contextOperations({kind:'group', id:'g1'}).some((item) => item.id === 'sports')).toBe(false);
  });

  it('adds ticket operations only to event and major-event contexts', () => {
    expect(contextOperations({kind:'event',id:'e1'}).find((item)=>item.id==='tickets')?.path).toEqual(['/tickets','event','e1']);
    expect(contextOperations({kind:'major-event',id:'m1'}).some((item)=>item.id==='tickets')).toBe(true);
    expect(contextOperations({kind:'group',id:'g1'}).some((item)=>item.id==='tickets')).toBe(false);
  });

  it('creates children with their actual parent and keeps global creation independent', () => {
    const major = {kind:'major-event' as const,id:'m1',name:'Semana',emoji:'🎓'};
    const group = {kind:'group' as const,id:'g1',name:'Trilha',emoji:'🌐',majorEventId:'m1'};
    expect(eventCreationTarget('event', group)).toEqual({commands:['/event-workspace','new','event'],queryParams:{eventGroupId:'g1',majorEventId:'m1'}});
    expect(eventCreationTarget('group', major).queryParams).toEqual({majorEventId:'m1'});
    expect(eventCreationTarget('major-event', major).queryParams).toBeUndefined();
    expect(eventCreationTarget('event').queryParams).toBeUndefined();
  });

  it('keeps global tools independent of event context', () => {
    for (const url of ['/event-workspace', '/people/person1', '/merge-candidates', '/certificates', '/preferences', '/event-workspace/event/%broken/settings', '/tickets']) {
      expect(eventContextFromUrl(url)).toBeNull();
    }
  });

  it('offers group interests and group certificate/publication routes without unsupported event operations', () => {
    const operations = contextOperations({kind:'group',id:'g1'});
    expect(operations.find((item)=>item.label==='Interessados')?.path).toEqual(['/subscriptions','group','g1','interests']);
    expect(operations.find((item)=>item.label==='Certificados')?.path).toEqual(['/certificates','event-group','g1']);
    expect(operations.some((item)=>['Inscrições','Presenças','Formulários','Sorteios'].includes(item.label))).toBe(false);
  });
});

describe('EventWorkspaceContextService', () => {
  const events = {getEvent:vi.fn()};
  const groups = {getEventGroup:vi.fn()};
  const majors = {getMajorEvent:vi.fn()};
  beforeEach(() => {
    vi.clearAllMocks();
    events.getEvent.mockReturnValue(of(createAdminEvent({id:'e1',name:'Oficina',emoji:'🧪'})));
    groups.getEventGroup.mockReturnValue(of(createAdminEventGroup({id:'g1',name:'Trilha',emoji:'🌐'})));
    majors.getMajorEvent.mockReturnValue(of(createAdminMajorEvent({id:'m1',name:'Semana',emoji:'🎓'})));
    TestBed.configureTestingModule({providers:[
      {provide:EventApiService,useValue:events},{provide:EventGroupApiService,useValue:groups},
      {provide:MajorEventApiService,useValue:majors},
      {provide:PermissionsService,useValue:{has:()=>true,canReadTab:(tab:string)=>tab!=='publication'}},
    ]});
  });

  it('hydrates sports-only scope identity without requiring major-event read access', async () => {
    const tournaments = vi.fn().mockReturnValue(of([{ majorEvent: { id: 'm1', name: 'Torneio', emoji: '🏆', startDate: new Date().toISOString(), endDate: new Date().toISOString() } }]));
    TestBed.overrideProvider(PermissionsService, { useValue: { has: (permission: string) => permission !== Permission.MajorEvent.Read, canReadTab: (tab: string) => tab === 'sports' } });
    TestBed.configureTestingModule({ providers: [{ provide: SportsApiService, useValue: { tournaments } }] });
    const service = TestBed.inject(EventWorkspaceContextService);
    await service.load({ kind: 'major-event', id: 'm1' });
    expect(majors.getMajorEvent).not.toHaveBeenCalled();
    expect(service.context()).toMatchObject({ name: 'Torneio', emoji: '🏆' });
    expect(service.operations().map((operation) => operation.id)).toEqual(['sports']);
    expect(service.error()).toBe('');
  });

  it('hydrates saved identity and filters operations by read access', async () => {
    const service=TestBed.inject(EventWorkspaceContextService);
    await service.load({kind:'group',id:'g1'});
    expect(service.context()).toMatchObject({kind:'group',id:'g1',name:'Trilha',emoji:'🌐',isSportsManaged:false});
    expect(service.operations().some((item)=>item.label==='Publicação')).toBe(false);
    expect(service.operations().some((item)=>item.label==='Interessados')).toBe(true);
  });

  it('uses the immediate group as the parent of a grouped event', async () => {
    const group = createAdminEventGroup({ id:'g1', name:'Trilha', emoji:'🌐' });
    events.getEvent.mockReturnValueOnce(of(createAdminEvent({id:'e1', eventGroupId:'g1', eventGroup:group, majorEventId:'m1'})));
    const service = TestBed.inject(EventWorkspaceContextService);
    await service.load({kind:'event',id:'e1'});
    expect(service.context()?.parent).toEqual({kind:'group',id:'g1',name:'Trilha',emoji:'🌐'});
  });

  it('resolves a group parent from its direct major-event relationship', async () => {
    groups.getEventGroup.mockReturnValueOnce(of(createAdminEventGroup({id:'g1',majorEventId:'m1'})));
    const service = TestBed.inject(EventWorkspaceContextService);
    await service.load({kind:'group',id:'g1'});
    expect(service.context()?.parent).toEqual({kind:'major-event',id:'m1',name:'Semana',emoji:'🎓'});
  });

  it('returns to the chosen major when browsing a legacy group without a direct parent', async () => {
    groups.getEventGroup.mockReturnValueOnce(of(createAdminEventGroup({id:'g1',majorEventId:null})));
    const service = TestBed.inject(EventWorkspaceContextService);
    service.rememberNavigationParent({kind:'group',id:'g1'}, {kind:'major-event',id:'m1',name:'Semana',emoji:'🎓'});
    await service.load({kind:'group',id:'g1'});
    expect(service.context()?.parent?.id).toBe('m1');
  });

  it('keeps an accessible child open when parent metadata is unavailable', async () => {
    groups.getEventGroup.mockReturnValueOnce(of(createAdminEventGroup({id:'g1',majorEventId:'m1'})));
    majors.getMajorEvent.mockReturnValueOnce(throwError(() => new Error('Forbidden parent')));
    const service = TestBed.inject(EventWorkspaceContextService);
    await service.load({kind:'group',id:'g1'});
    expect(service.context()?.id).toBe('g1');
    expect(service.context()?.parent).toBeNull();
    expect(service.error()).toBe('');
  });

  it('does not restore a parent from a previous scope after navigation', async () => {
    groups.getEventGroup.mockReturnValueOnce(of(createAdminEventGroup({id:'g1',majorEventId:'m1'})));
    const delayed = new Subject<ReturnType<typeof createAdminMajorEvent>>();
    majors.getMajorEvent.mockReturnValueOnce(delayed);
    const service = TestBed.inject(EventWorkspaceContextService);
    const pending = service.load({kind:'group',id:'g1'});
    await Promise.resolve();
    await service.load(null);
    delayed.next(createAdminMajorEvent({id:'m1'})); delayed.complete();
    await pending;
    expect(service.context()).toBeNull();
  });

  it('does not restore an old context after navigating to a global tool', async () => {
    const service=TestBed.inject(EventWorkspaceContextService);
    const delayed=new Subject<ReturnType<typeof createAdminEvent>>();
    events.getEvent.mockReturnValueOnce(delayed);
    const pending=service.load({kind:'event',id:'e1'});
    await service.load(null);
    delayed.next(createAdminEvent({id:'e1'}));delayed.complete();await pending;
    expect(service.context()).toBeNull();expect(service.operations()).toEqual([]);expect(service.loading()).toBe(false);
  });

  it('clears previous operations if a different context is unavailable', async () => {
    const service=TestBed.inject(EventWorkspaceContextService);
    await service.load({kind:'group',id:'g1'});
    events.getEvent.mockReturnValueOnce(throwError(()=>new Error('Forbidden')));
    await service.load({kind:'event',id:'e1'});
    expect(service.context()).toBeNull();expect(service.error()).not.toBe('');expect(service.operations()).toEqual([]);
  });
});
