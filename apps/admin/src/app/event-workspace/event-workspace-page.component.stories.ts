import { AuthService } from '@cacic-fct/shared-angular/auth';
import { ShellService } from '../app-shell/admin-shell.service';
import { routes as shellRoutes } from '../app-shell/admin-shell.routes';
import { cacicEventosHandlers } from '../../../.storybook/storybook-mocks';
import { Component, DestroyRef, afterNextRender, inject, provideAppInitializer, signal } from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet, convertToParamMap, provideRouter, withHashLocation, withDisabledInitialNavigation } from '@angular/router';
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { graphql, HttpResponse } from 'msw';
import { BehaviorSubject } from 'rxjs';
import { createAdminEvent, createAdminEventForm, createAdminEventFormResults, createAdminEventGroup, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { PermissionsService } from '../permissions/permissions.service';
import { EventWorkspacePageComponent } from './event-workspace-page.component';
import { eventContextFromUrl, type EventWorkspaceKind } from './event-workspace-context.service';

@Component({ template: '' })
class WorkspaceStoryDestination {}
@Component({ selector: 'app-integrated-event-workspace', imports: [RouterOutlet], template: '<router-outlet />' })
class IntegratedEventWorkspaceStory {
  private readonly router = inject(Router);
  constructor() {
    afterNextRender(() => {
      const bookmark = window.location.hash.slice(1);
      this.router.initialNavigation();
      if (!bookmark.startsWith('/')) void this.router.navigateByUrl('/event-workspace', { replaceUrl: true });
    });
  }
}
const integratedProviders = [
  provideRouter([...shellRoutes, {path:'**',component:WorkspaceStoryDestination}],withHashLocation(),withDisabledInitialNavigation()),
  {provide:AuthService,useValue:{user:signal({sub:'story-admin',email:'admin@example.com',roles:['admin'],claims:{name:'Organização'}}),roles:signal(['admin']),logout:async()=>undefined}},
  {provide:ShellService,useValue:{loading:signal(false),loadInitialData:async()=>undefined}},
  {provide:PermissionsService,useValue:{
    evaluateWorkspacePermissions:async()=>undefined,has:()=>true,hasAll:()=>true,hasAny:()=>true,missing:()=>[],
    canEdit:()=>true,canDelete:()=>true,canReadTab:()=>true,missingReadForTab:()=>[],
    granted:signal(new Set<string>()),rawPermissions:signal<string[]>([]),
  }},
];

interface Args {
  contextKind: EventWorkspaceKind | 'global';
  activityCount: number;
  emptySearch: boolean;
  failContext: boolean;
  failActivities: boolean;
  readOnly: boolean;
  longNames: boolean;
}
const defaults: Args = { contextKind:'global', activityCount:4, emptySearch:false, failContext:false, failActivities:false, readOnly:false, longNames:false };
let active = defaults;
const params = new BehaviorSubject(convertToParamMap({}));
const referenceDate = new Date();
const startDate = referenceDate.toISOString();
const endDate = new Date(referenceDate.getTime() + 2 * 3600000).toISOString();
const ids = { event:'workspace-event', group:'workspace-group', 'major-event':'workspace-major' };
function event(id = ids.event, index = 0, grouped = false) {
  const standalone = id === ids.event;
  return createAdminEvent({ id, name: active.longNames ? `Atividade de extensão interdisciplinar sobre acessibilidade, dados abertos e desenvolvimento responsável ${index + 1}` : standalone ? 'Oficina independente' : grouped ? `Laboratório do grupo ${index + 1}` : `Oficina de acessibilidade ${index + 1}`, emoji:'♿', startDate, endDate, majorEventId:standalone ? null : ids['major-event'], eventGroupId:grouped ? ids.group : null, majorEvent:standalone ? null : major(), eventGroup:grouped ? group() : null });
}
function group() { return createAdminEventGroup({id:ids.group,name:'Trilha de desenvolvimento web',emoji:'🌐',majorEventId:ids['major-event']}); }
function unrelatedGroup() { return createAdminEventGroup({id:'unrelated-group',name:'Grupo sem vínculo',emoji:'🧭',majorEventId:null}); }
function major() { return createAdminMajorEvent({id:ids['major-event'],name:'Semana da Computação',emoji:'🎓',startDate,endDate}); }
const majorAncestor = {kind:'MAJOR_EVENT',id:ids['major-event'],name:'Semana da Computação',emoji:'🎓'};
const groupAncestor = {kind:'EVENT_GROUP',id:ids.group,name:'Trilha de desenvolvimento web',emoji:'🌐'};
const contextNodes = {
  major: {kind:'MAJOR_EVENT',id:ids['major-event'],name:'Semana da Computação',emoji:'🎓',startDate,endDate,eventType:null,locationDescription:'FCT-Unesp',publicationState:'PUBLISHED',ancestors:[],hasChildren:true},
  olderMajor: {kind:'MAJOR_EVENT',id:'older-major',name:'Semana Acadêmica 2025',emoji:'📚',startDate,endDate,eventType:null,locationDescription:'FCT-Unesp',publicationState:'PUBLISHED',ancestors:[],hasChildren:false},
  group: {kind:'EVENT_GROUP',id:ids.group,name:'Trilha de desenvolvimento web',emoji:'🌐',startDate:null,endDate:null,eventType:null,locationDescription:null,publicationState:'PUBLISHED',ancestors:[majorAncestor],hasChildren:true},
  standaloneGroup: {kind:'EVENT_GROUP',id:'unrelated-group',name:'Grupo sem vínculo',emoji:'🧭',startDate:null,endDate:null,eventType:null,locationDescription:null,publicationState:'DRAFT',ancestors:[],hasChildren:true},
  directEvent: {kind:'EVENT',id:'activity-1',name:'Oficina de acessibilidade 1',emoji:'♿',startDate,endDate,eventType:'PALESTRA',locationDescription:'Sala 1',publicationState:'PUBLISHED',ancestors:[majorAncestor],hasChildren:false},
  groupEvent: {kind:'EVENT',id:'group-activity-1',name:'Laboratório do grupo 1',emoji:'♿',startDate,endDate,eventType:'MINICURSO',locationDescription:'Laboratório 2',publicationState:'PUBLISHED',ancestors:[majorAncestor,groupAncestor],hasChildren:false},
  standaloneEvent: {kind:'EVENT',id:ids.event,name:'Oficina independente',emoji:'♿',startDate,endDate,eventType:'OTHER',locationDescription:'Auditório',publicationState:'DRAFT',ancestors:[],hasChildren:false},
};
function form() {
  const value = createAdminEventForm({ id: 'workspace-form', ownerEventId: 'activity-1' });
  return { ...value, links: value.links.map((link) => ({ ...link, eventId: 'activity-1', event: event('activity-1') })) };
}
const handlers = [
  graphql.query('AdminEventContextPage', ({variables}) => {
    if (active.emptySearch) return HttpResponse.json({data:{adminEventContextPage:{nodes:[],nextCursor:null}}});
    const parentKind=variables['parentKind'];
    const parentId=variables['parentId'];
    const childKind=variables['childKind'];
    const query=String(variables['query']??'').trim().toLocaleLowerCase('pt-BR');
    let nodes = [] as (typeof contextNodes)[keyof typeof contextNodes][];
    let nextCursor:string|null=null;
    if (query) {
      nodes=[contextNodes.groupEvent,contextNodes.directEvent,contextNodes.standaloneEvent,contextNodes.group,contextNodes.major,contextNodes.standaloneGroup,contextNodes.olderMajor]
        .filter((node)=>[node.name,node.locationDescription,node.eventType,...node.ancestors.map((ancestor)=>ancestor.name)].some((value)=>String(value??'').toLocaleLowerCase('pt-BR').includes(query)));
    } else if (parentKind==='MAJOR_EVENT'&&parentId===ids['major-event']&&childKind==='EVENT_GROUP') {
      nodes=[contextNodes.group];
    } else if (parentKind==='MAJOR_EVENT'&&parentId===ids['major-event']&&childKind==='EVENT') {
      nodes=[contextNodes.directEvent];
    } else if (parentKind==='EVENT_GROUP'&&parentId===ids.group&&childKind==='EVENT') {
      nodes=[contextNodes.groupEvent];
    } else if (parentKind==='MAJOR_EVENT'&&parentId===ids['major-event']&&variables['cursor']==='major-children-page-2') {
      nodes=[contextNodes.directEvent];
    } else if (parentKind==='MAJOR_EVENT'&&parentId===ids['major-event']) {
      nodes=[contextNodes.group];
      nextCursor='major-children-page-2';
    } else if (parentKind==='EVENT_GROUP'&&parentId===ids.group) {
      nodes=[contextNodes.groupEvent];
    } else if (parentKind==='EVENT_GROUP'&&parentId==='unrelated-group') {
      nodes=[{...contextNodes.standaloneEvent,id:'standalone-group-event',name:'Encontro do grupo independente',ancestors:[{kind:'EVENT_GROUP',id:'unrelated-group',name:'Grupo sem vínculo',emoji:'🧭'}]}];
    } else if (variables['cursor']==='roots-page-2') {
      nodes=[contextNodes.olderMajor];
    } else {
      nodes=[contextNodes.major,contextNodes.standaloneGroup,contextNodes.standaloneEvent];
      nextCursor='roots-page-2';
    }
    return HttpResponse.json({data:{adminEventContextPage:{nodes,nextCursor}}});
  }),
  graphql.query('ListEventDrafts', () => HttpResponse.json({ data: { eventDrafts: [] } })),
  graphql.query('ListEventAttendanceCollectors', () => HttpResponse.json({ data: { eventAttendanceCollectors: [] } })),
  graphql.query('EventForms', () => HttpResponse.json({ data: { eventForms: [form()] } })),
  graphql.query('EventForm', () => HttpResponse.json({ data: { eventForm: form() } })),
  graphql.query('EventFormDrafts', () => HttpResponse.json({ data: { eventFormDrafts: [] } })),
  graphql.query('EventFormResults', () => HttpResponse.json({ data: { eventFormResults: createAdminEventFormResults({ form: form() }) } })),
  graphql.query('EventFormPreviousSubscriberCount', () => HttpResponse.json({ data: { eventFormPreviousSubscriberCount: 18 } })),
  graphql.query('PrizeDraws', () => HttpResponse.json({ data: { prizeDraws: [] } })),
  graphql.query('ListEvents', ({variables}) => {
    const scoped = Boolean(variables['majorEventId'] || variables['eventGroupId']);
    if (scoped && active.failActivities) return HttpResponse.json({errors:[{message:'Atividades indisponíveis'}]});
    const all = active.emptySearch ? [] : variables['eventGroupId'] === ids.group
      ? Array.from({length:active.activityCount},(_,index)=>event(`group-activity-${index+1}`,index,true))
      : variables['majorEventId'] === ids['major-event'] && variables['isInGroup'] === false
        ? Array.from({length:active.activityCount},(_,index)=>event(`activity-${index+1}`,index))
        : scoped ? [event('unrelated-event')] : [event(), event('group-activity-1',0,true)];
    const query = String(variables['query'] ?? '').toLocaleLowerCase('pt-BR');
    const filtered = all.filter((item)=>item.name.toLocaleLowerCase('pt-BR').includes(query));
    const skip = Number(variables['skip'] ?? 0);
    return HttpResponse.json({data:{events:filtered.slice(skip,skip+Number(variables['take'] ?? 20))}});
  }),
  graphql.query('ListEventGroups', ({variables}) => {
    const candidates = variables['majorEventId'] === ids['major-event'] ? [group()] : [group(),unrelatedGroup()];
    return HttpResponse.json({data:{eventGroups:active.emptySearch ? [] : candidates.filter((item)=>item.name.toLocaleLowerCase('pt-BR').includes(String(variables['query']??'').toLocaleLowerCase('pt-BR')))}});
  }),
  graphql.query('ListMajorEvents', ({variables}) => HttpResponse.json({data:{majorEvents:active.emptySearch ? [] : [major()].filter((item)=>item.name.toLocaleLowerCase('pt-BR').includes(String(variables['query']??'').toLocaleLowerCase('pt-BR')))}})),
  graphql.query('GetEvent', ({variables}) => {
    const id = String(variables['id']);
    const grouped = id.startsWith('group-activity-');
    const index = Math.max(0, Number(id.replace(grouped ? 'group-activity-' : 'activity-', '')) - 1) || 0;
    return active.failContext ? HttpResponse.json({errors:[{message:'Contexto indisponível'}]}) : HttpResponse.json({data:{event:event(id,index,grouped)}});
  }),
  graphql.query('GetEventGroup', () => active.failContext ? HttpResponse.json({errors:[{message:'Contexto indisponível'}]}) : HttpResponse.json({data:{eventGroup:group()}})),
  graphql.query('GetMajorEvent', () => active.failContext ? HttpResponse.json({errors:[{message:'Contexto indisponível'}]}) : HttpResponse.json({data:{majorEvent:major()}})),
  graphql.query('WorkspaceEventSubscriptionCount', () => HttpResponse.json({data:{workspaceEventSubscriptionCount:18}})),
  graphql.query('EventAttendanceCount', () => HttpResponse.json({data:{eventAttendanceCount:12}})),
  graphql.query('EventInterestCount', () => HttpResponse.json({data:{eventInterestCount:7}})),
];
const meta: Meta<Args> = {
  component: EventWorkspacePageComponent,
  title:'CACiC Eventos/Workspace/Event Workspace', tags:['autodocs'], args:defaults,
  argTypes:{contextKind:{control:'select',options:['global','event','group','major-event']},activityCount:{control:{type:'range',min:0,max:40}},emptySearch:{control:'boolean'},failContext:{control:'boolean'},failActivities:{control:'boolean'},readOnly:{control:'boolean'},longNames:{control:'boolean'}},
  decorators:[(story,context)=> context.parameters['integratedWorkspace']
    ? applicationConfig({providers:integratedProviders})(story,context)
    : applicationConfig({providers:[
    provideRouter([{path:'**',component:WorkspaceStoryDestination}],withHashLocation(),withDisabledInitialNavigation()),
    {provide:ActivatedRoute,useValue:{paramMap:params,snapshot:{url:[]}}},
    {provide:PermissionsService,useValue:{evaluateWorkspacePermissions:async()=>undefined,has:(permission:string)=>!active.readOnly||permission.endsWith('#read'),hasAny:(permissions:string[])=>permissions.some((permission)=>!active.readOnly||permission.endsWith('#read')),canReadTab:()=>true,canEdit:()=>!active.readOnly,canDelete:()=>!active.readOnly,hasAll:()=>!active.readOnly}},
    provideAppInitializer(()=>{
      const router=inject(Router);
      const subscription=router.events.subscribe((entry)=>{
        if (entry instanceof NavigationEnd) {
          const ref=eventContextFromUrl(entry.urlAfterRedirects);
          params.next(convertToParamMap(ref?{targetType:ref.kind,targetId:ref.id, ...(entry.urlAfterRedirects.endsWith('/settings') ? {section:'settings'} : {})}:{}));
        }
      });
      inject(DestroyRef).onDestroy(()=>subscription.unsubscribe());
    }),
  ]})(story,context)],
  render:(args)=>{active=args;params.next(convertToParamMap(args.contextKind==='global'?{}:{targetType:args.contextKind,targetId:ids[args.contextKind]}));return {props:{}};},
  parameters:{layout:'fullscreen',msw:{handlers:{graphql:[...handlers, ...cacicEventosHandlers]}}},
};
export default meta;
type Story=StoryObj<Args>;
export const Playground:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByRole('heading',{name:'Ferramentas globais'})).toBeVisible();
  await expect(await canvas.findByRole('button',{name:'Selecionar Semana da Computação'})).toBeVisible();
  await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
}};
export const SelectedMajorEvent:Story={args:{contextKind:'major-event'},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByRole('button',{name:/Semana da Computação/})).toBeVisible();
  await expect(await canvas.findByRole('heading',{name:'Programação'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Configurações'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Presenças'})).toHaveAttribute('href','#/attendances/major-event/workspace-major');
}};
export const SelectedGroup:Story={args:{contextKind:'group'},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByRole('button',{name:/Trilha de desenvolvimento web/})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Interessados'})).toHaveAttribute('href','#/subscriptions/group/workspace-group/interests');
  await expect(canvas.queryByRole('link',{name:'Presenças'})).not.toBeInTheDocument();
}};
export const SelectedEvent:Story={args:{contextKind:'event'},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByRole('button',{name:/Oficina independente/})).toBeVisible();
  await waitFor(()=>expect([...canvasElement.querySelectorAll('.participation-summary dd')].map((item)=>item.textContent?.trim())).toEqual(['18','12','7']));
  await expect(await canvas.findByRole('heading',{name:'Editar evento'})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Configurações'})).toBeVisible();
}};
export const KeyboardContextSwitch:Story={args:{contextKind:'major-event'},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  const picker=await canvas.findByRole('button',{name:/Semana da Computação.*Trocar contexto/});
  picker.focus();await userEvent.keyboard('{Enter}');
  const search=canvas.getByRole('searchbox',{name:'Buscar contexto'});
  await userEvent.type(search,'Trilha');
  await waitFor(()=>expect(canvas.queryByRole('button',{name:'Selecionar Semana da Computação'})).not.toBeInTheDocument());
  const next=await canvas.findByRole('button',{name:'Selecionar Trilha de desenvolvimento web'});
  next.focus();await userEvent.keyboard('{Enter}');
  await expect(await canvas.findByRole('button',{name:/Trilha de desenvolvimento web/})).toBeVisible();
}};
export const EmptyActivities:Story={args:{contextKind:'major-event',activityCount:0},play:async({canvasElement})=>{await expect(await within(canvasElement).findByText('Nenhum evento encontrado neste contexto.')).toBeVisible();}};
export const ErrorActivities:Story={args:{contextKind:'group',failActivities:true},play:async({canvasElement})=>{await expect(await within(canvasElement).findByText('Não foi possível carregar as atividades. Tente novamente.')).toBeVisible();}};
export const ErrorContext:Story={args:{contextKind:'event',failContext:true},play:async({canvasElement})=>{await expect(await within(canvasElement).findByRole('alert')).toHaveTextContent('Não foi possível abrir este contexto.');}};
export const DenseActivities:Story={args:{contextKind:'major-event',activityCount:30},play:async({canvasElement})=>{
  const canvas=within(canvasElement);await expect(await canvas.findByRole('button',{name:'Oficina de acessibilidade 30'})).toBeVisible();await expect(canvas.queryByRole('button',{name:'Próximas atividades'})).not.toBeInTheDocument();
}};
export const MobileDark:Story={args:{contextKind:'major-event',longNames:true},globals:{theme:'dark',motion:'reduced',viewport:{value:'mobile',isRotated:false}},play:async({canvasElement})=>{await expect(await within(canvasElement).findByRole('button',{name:/Semana da Computação/})).toBeVisible();}};

export const EmptySearch:Story={args:{emptySearch:true},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByText('Nenhum contexto encontrado. Revise a busca ou volte à página anterior.')).toBeVisible();
  await expect(canvas.getByRole('heading',{name:'Ferramentas globais'})).toBeVisible();
}};
export const ReadOnlyContext:Story={args:{contextKind:'event',readOnly:true},play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await expect(await canvas.findByRole('button',{name:/Oficina independente/})).toBeVisible();
  await expect(canvas.getByRole('link',{name:'Presenças'})).toHaveAttribute('href','#/attendances/event/workspace-event');
  await userEvent.click(canvas.getByRole('link',{name:'Configurações'}));
  await expect(await canvas.findByRole('heading',{name:'Editar evento'})).toBeVisible();
  await expect(canvas.queryByRole('button',{name:'Salvar e agendar'})).not.toBeInTheDocument();
}};

export const IntegratedShellHubAndEditor:Story={
  parameters:{integratedWorkspace:true,msw:{handlers:{graphql:[...handlers,...cacicEventosHandlers]}}},
  decorators:[moduleMetadata({imports:[IntegratedEventWorkspaceStory]})],
  render:()=>{active={...defaults,contextKind:'major-event'};return {template:'<app-integrated-event-workspace />'};},
  play:async({canvasElement})=>{
    if (new URL(canvasElement.ownerDocument.URL).searchParams.get('embed') === 'true') return;
    const canvas=within(canvasElement);
    const isMobile=()=>Boolean(canvas.queryByRole('button',{name:'Abrir menu'}));
    const openSidebar=async()=>{
      if (!canvas.queryByRole('navigation',{name:'Operações do evento'})) {
        const menu=canvas.queryByRole('button',{name:'Abrir menu'});
        if (menu) await userEvent.click(menu);
      }
      return within(await canvas.findByRole('navigation',{name:'Operações do evento'}, {timeout:20000}));
    };
    const closeSidebar=async()=>{if(isMobile()) await userEvent.keyboard('{Escape}');};
    await userEvent.click(await canvas.findByRole('button',{name:'Escolher evento'}, {timeout:20000}));
    const contextDialog=within(await within(canvasElement.ownerDocument.body).findByRole('dialog',{name:'Escolher contexto'}));
    await userEvent.click(await contextDialog.findByRole('button',{name:'Selecionar Semana da Computação'}));
    let sidebar=await openSidebar();
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Semana da Computação'}, {timeout:20000})).toBeVisible();
    await expect(sidebar.queryByRole('link',{name:'Grandes eventos'})).not.toBeInTheDocument();
    await expect(await canvas.findByRole('heading',{name:'Programação'})).toBeVisible();
    await expect(canvas.getByRole('heading',{name:'Grupos de eventos'})).toBeVisible();
    await userEvent.click(canvas.getByRole('link',{name:'Configurações'}));
    await expect(await canvas.findByRole('heading',{name:'Editar grande evento'})).toBeVisible();
    await expect(sidebar.getByRole('link',{name:'Configurações'})).toBeVisible();
    await userEvent.click(sidebar.getByRole('button',{name:'Abrir grupo neste contexto'}));
    const groupsDialog=within(await within(canvasElement.ownerDocument.body).findByRole('dialog',{name:'Grupos deste contexto'}));
    await expect(groupsDialog.getByRole('searchbox',{name:'Buscar grupos deste contexto'})).toHaveFocus();
    await expect(await groupsDialog.findByRole('button',{name:'Selecionar Trilha de desenvolvimento web'})).toBeVisible();
    await expect(groupsDialog.queryByRole('button',{name:'Selecionar Grupo sem vínculo'})).not.toBeInTheDocument();
    await userEvent.click(groupsDialog.getByRole('button',{name:'Selecionar Trilha de desenvolvimento web'}));
    sidebar=await openSidebar();
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Trilha de desenvolvimento web'}, {timeout:20000})).toBeVisible();
    await expect(await sidebar.findByRole('button',{name:'Voltar para Semana da Computação'})).toBeVisible();
    await userEvent.click(sidebar.getByRole('button',{name:'Abrir evento neste contexto'}));
    const eventsDialog=within(await within(canvasElement.ownerDocument.body).findByRole('dialog',{name:'Eventos deste contexto'}));
    await expect(eventsDialog.getByRole('searchbox',{name:'Buscar eventos deste contexto'})).toHaveFocus();
    await expect(await eventsDialog.findByRole('button',{name:'Selecionar Laboratório do grupo 1'})).toBeVisible();
    await expect(eventsDialog.queryByRole('button',{name:'Selecionar Oficina de acessibilidade 1'})).not.toBeInTheDocument();
    await userEvent.click(eventsDialog.getByRole('button',{name:'Selecionar Laboratório do grupo 1'}));
    sidebar=await openSidebar();
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Laboratório do grupo 1'}, {timeout:20000})).toBeVisible();
    await userEvent.click(sidebar.getByRole('button',{name:'Voltar para Trilha de desenvolvimento web'}));
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Trilha de desenvolvimento web'}, {timeout:20000})).toBeVisible();
    sidebar=await openSidebar();
    await userEvent.click(sidebar.getByRole('button',{name:'Voltar para Semana da Computação'}));
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Semana da Computação'}, {timeout:20000})).toBeVisible();
    sidebar=await openSidebar();
    await userEvent.click(sidebar.getByRole('button',{name:'Menu global'}));
    const global=within(await canvas.findByRole('navigation',{name:'Navegação interna'}));
    await expect(global.getByRole('link',{name:'Eventos'})).toBeVisible();
    await expect(global.getByRole('link',{name:'Inscrições'})).toBeVisible();
    await userEvent.click(global.getByRole('button',{name:'Menu do contexto'}));
    await userEvent.click(sidebar.getByRole('link',{name:'Visão geral'}));
    await closeSidebar();
    const child=await canvas.findByRole('link',{name:'Oficina de acessibilidade 1'});
    child.focus();await userEvent.keyboard('{Enter}');
    sidebar=await openSidebar();
    await expect(await canvas.findByRole('button',{name:'Trocar contexto: Oficina de acessibilidade 1'}, {timeout:20000})).toBeVisible();
    await expect(sidebar.queryByRole('link',{name:'Visão geral'})).not.toBeInTheDocument();
    await expect(sidebar.getByRole('link',{name:'Configurações'})).toHaveAttribute('aria-current','page');
    await expect(sidebar.getByRole('link',{name:'Formulários'})).toHaveAttribute('href',/\/forms\/event\/activity-1$/);
    await expect(sidebar.getByRole('link',{name:'Sorteios'})).toHaveAttribute('href',/\/draws\?eventId=activity-1$/);
    await userEvent.click(sidebar.getByRole('link',{name:'Configurações'}));
    await expect(await canvas.findByRole('heading',{name:'Editar evento'}, {timeout:20000})).toBeVisible();
    await expect(sidebar.getByRole('link',{name:'Configurações'})).toBeVisible();
    await expect(canvas.queryByRole('tablist',{name:'Operações do evento'})).not.toBeInTheDocument();
    await expect(canvasElement.querySelector('app-workspace-events-tab app-event-filter-panel')).toBeNull();
    const visiblePickers=[...canvasElement.querySelectorAll('app-event-context-picker')].filter((element)=>element.getBoundingClientRect().height>0);
    await expect(visiblePickers).toHaveLength(0);
    await userEvent.click(sidebar.getByRole('link',{name:'Formulários'}));
    await expect(await canvas.findByRole('searchbox',{name:'Buscar formulário'}, {timeout:20000})).toBeVisible();
    const forms=await canvas.findAllByRole('link',{name:/Abrir formulário/});
    await userEvent.click(forms[0]);
    await waitFor(()=>expect(window.location.hash).toContain('eventId=activity-1'));
    sidebar=await openSidebar();
    await expect(sidebar.getByRole('link',{name:'Formulários'})).toHaveAttribute('aria-current','page');
    await expect(canvas.getByRole('button',{name:'Trocar contexto: Oficina de acessibilidade 1'})).toBeVisible();
    await userEvent.click(sidebar.getByRole('link',{name:'Sorteios'}));
    await expect(await canvas.findByRole('heading',{name:'Novo sorteio'}, {timeout:20000})).toBeVisible();
    sidebar=await openSidebar();
    await expect(sidebar.getByRole('link',{name:'Sorteios'})).toHaveAttribute('aria-current','page');
    const selector=canvas.getByRole('button',{name:'Trocar contexto: Oficina de acessibilidade 1'});
    await userEvent.click(selector);
    const dialog=within(await within(canvasElement.ownerDocument.body).findByRole('dialog',{name:'Escolher contexto'}));
    await expect(dialog.getByRole('searchbox')).toHaveFocus();
    await userEvent.click(dialog.getByRole('button',{name:'Cancelar'}));
    await expect(selector).toHaveFocus();
    await expect(canvas.getAllByRole('navigation',{name:'Operações do evento'})).toHaveLength(1);
    await expect(sidebar.getByRole('link',{name:'Sorteios'})).toHaveAttribute('aria-current','page');
  },
};
