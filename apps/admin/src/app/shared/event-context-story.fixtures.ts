import type { AdminEventContextNode, AdminEventContextPage, AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';

const today=new Date();
const older=new Date(today.getTime()-400*86400000).toISOString();
export const contextStoryMajor:AdminEventContextNode={kind:'MAJOR_EVENT',id:'major-1',name:'Semana da Computação',emoji:'🎓',startDate:today.toISOString(),ancestors:[],hasChildren:true};
export const contextStoryGroup:AdminEventContextNode={kind:'EVENT_GROUP',id:'group-1',name:'Trilha de desenvolvimento web',emoji:'🌐',ancestors:[contextStoryMajor],hasChildren:true};
export const contextStoryEvent:AdminEventContextNode={kind:'EVENT',id:'event-1',name:'Oficina de acessibilidade',emoji:'♿',startDate:today.toISOString(),eventType:'MINICURSO',locationDescription:'Auditório central',publicationState:'PUBLISHED',ancestors:[contextStoryMajor],hasChildren:false};
export const contextStoryGroupEvent:AdminEventContextNode={...contextStoryEvent,id:'event-2',name:'Encontro da trilha',emoji:'🎙️',ancestors:[contextStoryMajor,contextStoryGroup]};
export const contextStoryOldEvent:AdminEventContextNode={...contextStoryEvent,id:'older-event',name:'Encontro da edição anterior',emoji:'📚',startDate:older,ancestors:[]};

export interface ContextStoryOptions { empty?:boolean; longNames?:boolean; }
export function contextStoryPage(options:AdminEventContextPageOptions={},settings:ContextStoryOptions={}):AdminEventContextPage {
  if(settings.empty) return {nodes:[],nextCursor:null};
  let nodes:AdminEventContextNode[];
  let nextCursor:string|null=null;
  const filteredEvents = Boolean(options.startDateFrom || options.startDateUntil) || typeof options.isInGroup === 'boolean' || typeof options.isInMajorEvent === 'boolean';
  if (filteredEvents) {
    nodes = [contextStoryGroupEvent, contextStoryEvent, contextStoryOldEvent].filter((node) => {
      if (options.parentId && !node.ancestors.some((ancestor) => ancestor.id === options.parentId)) return false;
      if (options.startDateFrom && (node.startDate ?? '') < options.startDateFrom) return false;
      if (options.startDateUntil && (node.startDate ?? '') > options.startDateUntil) return false;
      if (typeof options.isInGroup === 'boolean' && node.ancestors.some((ancestor) => ancestor.kind === 'EVENT_GROUP') !== options.isInGroup) return false;
      return typeof options.isInMajorEvent !== 'boolean' || node.ancestors.some((ancestor) => ancestor.kind === 'MAJOR_EVENT') === options.isInMajorEvent;
    });
  } else if(options.parentId==='major-1') {
    nodes=options.childKind==='EVENT_GROUP'?[contextStoryGroup]:options.childKind==='EVENT'?[contextStoryEvent]
      :options.cursor==='major-more'?[{...contextStoryEvent,id:'major-later',name:'Sessão complementar'}]:[contextStoryGroup,contextStoryEvent];
    if(!options.childKind && !options.cursor) nextCursor='major-more';
  } else if(options.parentId==='group-1') nodes=[contextStoryGroupEvent];
  else if(options.parentId) nodes=[];
  else if(options.query) {
    // Deliberately non-alphabetical order: emulate server-ranked contextual matches.
    nodes=[contextStoryGroupEvent,contextStoryEvent,contextStoryGroup,contextStoryMajor,contextStoryOldEvent];
  } else if(options.cursor==='older-page') nodes=[contextStoryOldEvent];
  else {nodes=[contextStoryMajor];nextCursor='older-page';}
  const query=options.query?.toLocaleLowerCase('pt-BR');
  if(query) {
    nodes=nodes.filter((node)=>[node.name,node.eventType,node.locationDescription,...node.ancestors.map((ancestor)=>ancestor.name)].join(' ').toLocaleLowerCase('pt-BR').includes(query));
    nextCursor=null;
  }
  if(settings.longNames) nodes=nodes.map((node)=>({...node,name:`${node.name} — formação interdisciplinar para a comunidade universitária e projetos de extensão` }));
  return {nodes,nextCursor};
}
