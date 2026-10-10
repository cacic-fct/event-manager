import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of, throwError } from 'rxjs';
import { EventContextPickerComponent, type EventContextRef } from './event-context-picker.component';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';
import { contextStoryPage, contextStoryMajor, contextStoryGroup, contextStoryEvent, contextStoryGroupEvent } from './event-context-story.fixtures';

type Args={context:EventContextRef|null;allowGroups:boolean;empty:boolean;fail:boolean;limited:boolean;longNames:boolean;parentContext:EventContextRef|null;childKind:'event'|'group'|null;};
const defaults:Args={context:null,allowGroups:false,empty:false,fail:false,limited:false,longNames:false,parentContext:null,childKind:null};
let active=defaults;
const meta:Meta<Args>={
  component:EventContextPickerComponent,title:'CACiC Eventos/Workspace/Shared/Event Context Picker',tags:['autodocs'],args:defaults,
  argTypes:{context:{control:'object'},allowGroups:{control:'boolean'},empty:{control:'boolean'},fail:{control:'boolean'},limited:{control:'boolean'},longNames:{control:'boolean'},parentContext:{control:'object'},childKind:{control:'select',options:[null,'event','group']}},
  decorators:[applicationConfig({providers:[
    {provide:AdminEventContextApiService,useValue:{listPage:(options:AdminEventContextPageOptions)=>active.fail?throwError(()=>new Error('Unavailable')):of(contextStoryPage(options,active))}},
    {provide:EventApiService,useValue:{getEvent:(id:string)=>of(id==='event-2'?contextStoryGroupEvent:contextStoryEvent)}},
    {provide:MajorEventApiService,useValue:{getMajorEvent:()=>of(contextStoryMajor)}},
    {provide:EventGroupApiService,useValue:{getEventGroup:()=>of(contextStoryGroup)}},
    {provide:PermissionsService,useValue:{evaluateWorkspacePermissions:async()=>undefined,has:(scope:string)=>!active.limited||scope===Permission.Event.Read}},
  ]})],
  render:(args)=>{active=args;return {props:args,template:'<app-event-context-picker [(context)]="context" [allowGroups]="allowGroups" [parentContext]="parentContext" [childKind]="childKind" />'};},
};
export default meta;
type Story=StoryObj<Args>;
export const Playground:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(await canvas.findByRole('button',{name:'Expandir Semana da Computação'}));
  await userEvent.click(await canvas.findByRole('button',{name:'Selecionar Oficina de acessibilidade'}));
  await expect(await canvas.findByRole('button',{name:/Trocar contexto/})).toBeVisible();
  await expect(canvas.queryByRole('navigation')).not.toBeInTheDocument();
}};
export const HierarchyKeyboard:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  const major=await canvas.findByRole('button',{name:'Expandir Semana da Computação'});major.focus();await userEvent.keyboard('{Enter}');
  const group=await canvas.findByRole('button',{name:'Expandir Trilha de desenvolvimento web'});group.focus();await userEvent.keyboard('{Enter}');
  await expect(await canvas.findByRole('button',{name:'Selecionar Encontro da trilha'})).toBeVisible();
  await expect(canvas.queryByRole('button',{name:'Selecionar Trilha de desenvolvimento web'})).not.toBeInTheDocument();
}};
export const AllChildrenLoaded:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);
  await userEvent.click(await canvas.findByRole('button',{name:'Expandir Semana da Computação'}));
  await expect(await canvas.findByRole('button',{name:'Selecionar Sessão complementar'})).toBeVisible();
  await expect(canvas.queryByRole('button',{name:/Próxima página de Semana da Computação/})).not.toBeInTheDocument();
}};
export const OlderRootPages:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);await userEvent.click(await canvas.findByRole('button',{name:'Próxima página de contextos'}));
  await expect(await canvas.findByRole('button',{name:'Selecionar Encontro da edição anterior'})).toBeVisible();
  await expect(canvas.getByRole('searchbox')).toHaveValue('');
  await userEvent.click(canvas.getByRole('button',{name:'Página anterior de contextos'}));
  await expect(await canvas.findByRole('button',{name:'Expandir Semana da Computação'})).toBeVisible();
}};
export const RankedContextSearch:Story={play:async({canvasElement})=>{
  const canvas=within(canvasElement);await userEvent.type(canvas.getByRole('searchbox'),'Semana');
  await expect(await canvas.findByRole('button',{name:'Selecionar Encontro da trilha'})).toBeVisible();
  await expect(canvasElement.querySelector('.node-ancestry')).toHaveTextContent('Semana da Computação');
  await expect(canvas.queryByRole('button',{name:'Expandir Semana da Computação'})).not.toBeInTheDocument();
}};
export const EventFilters: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Filtros/ }));
  await userEvent.click(canvas.getByRole('combobox', { name: 'Vínculo com grupo' }));
  await userEvent.click(await within(document.body).findByRole('option', { name: 'Com grupo' }));
  await expect(await canvas.findByRole('button', { name: 'Selecionar Encontro da trilha' })).toBeVisible();
  await expect(canvas.queryByRole('button', { name: 'Selecionar Oficina de acessibilidade' })).not.toBeInTheDocument();
  await expect(canvas.getByRole('textbox', { name: 'Início a partir de' })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: 'Limpar' }));
  await expect(await canvas.findByRole('button', { name: 'Expandir Semana da Computação' })).toBeVisible();
} };
export const FilterControls: Story = {};
export const GroupChildrenOnly:Story={args:{parentContext:{kind:'group',id:'group-1'},childKind:'event'},play:async({canvasElement})=>{
  const canvas=within(canvasElement);await expect(await canvas.findByRole('button',{name:'Selecionar Encontro da trilha'})).toBeVisible();
  await expect(canvas.queryByRole('button',{name:'Selecionar Oficina de acessibilidade'})).not.toBeInTheDocument();
}};
export const EmptySearch:Story={args:{empty:true},play:async({canvasElement})=>{await expect(await within(canvasElement).findByText('Nenhum contexto encontrado. Revise a busca ou volte à página anterior.')).toBeVisible();}};
export const ErrorRecovery:Story={args:{fail:true},play:async({canvasElement})=>{await expect(await within(canvasElement).findByRole('button',{name:'Tentar novamente'})).toBeVisible();}};
export const MobileDark:Story={args:{longNames:true},globals:{theme:'dark',motion:'reduced'},parameters:{viewport:{defaultViewport:'mobile'}},play:async({canvasElement})=>{await expect(await within(canvasElement).findByRole('button',{name:/Expandir Semana da Computação/})).toBeVisible();}};
