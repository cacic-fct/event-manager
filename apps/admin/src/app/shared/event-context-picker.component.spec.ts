import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';
import type { AdminEventContextPage } from '@cacic-fct/event-manager-admin-contracts';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EventContextPickerComponent } from './event-context-picker.component';
import { ADMIN_SHELL_CONTEXT } from './admin-shell-context';
import { flushAsync } from '../testing/async-test-helpers';
import { contextStoryEvent as event, contextStoryGroup as group, contextStoryMajor as major, contextStoryPage } from './event-context-story.fixtures';

describe('EventContextPickerComponent paged hierarchy',()=>{
  const api={listPage:vi.fn()};
  const events={getEvent:vi.fn(()=>of(event))};
  const groups={getEventGroup:vi.fn(()=>of(group))};
  const majors={getMajorEvent:vi.fn(()=>of(major))};
  const permissions={evaluateWorkspacePermissions:vi.fn(async()=>undefined),has:vi.fn(()=>true)};
  beforeEach(async()=>{
    vi.clearAllMocks();api.listPage.mockImplementation((options)=>of(contextStoryPage(options)));permissions.has.mockReturnValue(true);
    await TestBed.configureTestingModule({imports:[EventContextPickerComponent],providers:[
      provideRouter([]),provideNoopAnimations(),{provide:ADMIN_SHELL_CONTEXT,useValue:false},
      {provide:AdminEventContextApiService,useValue:api},{provide:EventApiService,useValue:events},
      {provide:EventGroupApiService,useValue:groups},{provide:MajorEventApiService,useValue:majors},
      {provide:PermissionsService,useValue:permissions},
    ]}).compileComponents();
  });
  async function render(inputs:Record<string,unknown>={}){
    const fixture=TestBed.createComponent(EventContextPickerComponent);
    for(const [key,value] of Object.entries(inputs)) fixture.componentRef.setInput(key,value);
    fixture.detectChanges();await flushAsync();fixture.detectChanges();return fixture;
  }

  it('browses older root pages without entering a search and restores the previous cursor',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;
    expect(api.listPage).toHaveBeenCalledWith({take:20});
    await picker.nextPage();expect(picker.results()[0].id).toBe('older-event');
    expect(api.listPage).toHaveBeenLastCalledWith({take:20,cursor:'older-page'});
    await picker.previousPage();expect(picker.results()[0].id).toBe('major-1');expect(picker.cursorHistory()).toEqual([]);
    expect(picker.query.value).toBe('');
  });

  it('separates expanding a parent from selecting it and loads every child page',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;const selected=vi.fn();picker.contextChange.subscribe(selected);
    await picker.toggleBranch(major);fixture.detectChanges();
    expect(selected).not.toHaveBeenCalled();
    expect(api.listPage).toHaveBeenNthCalledWith(3,{parentKind:'MAJOR_EVENT',parentId:'major-1',take:20,cursor:'major-more'});
    expect(picker.branch(major)?.nodes.map((node)=>node.id)).toEqual(['group-1','event-1','major-later']);
    expect(picker.cursorHistory()).toEqual([]);
    picker.choose(event);expect(selected).toHaveBeenCalledWith({kind:'event',id:'event-1'});
  });

  it('loads every page for a parent-filtered picker and hides root pagination',async()=>{
    api.listPage.mockImplementation((options:{parentKind?:string;childKind?:string;cursor?:string})=>
      options.parentKind==='MAJOR_EVENT' && options.childKind==='EVENT'
        ? of(options.cursor==='child-more'
          ? {nodes:[{...event,id:'event-3',name:'Sessão complementar'}],nextCursor:null}
          : {nodes:[event],nextCursor:'child-more'})
        : of(contextStoryPage(options as never)));
    const fixture=await render({parentContext:{kind:'major-event',id:'major-1'},childKind:'event',searchOnly:true});
    const picker=fixture.componentInstance;
    expect(picker.results().map((node)=>node.id)).toEqual(['event-1','event-3']);
    expect(api.listPage).toHaveBeenNthCalledWith(1,{take:20,parentKind:'MAJOR_EVENT',parentId:'major-1',childKind:'EVENT'});
    expect(api.listPage).toHaveBeenNthCalledWith(2,{take:20,parentKind:'MAJOR_EVENT',parentId:'major-1',childKind:'EVENT',cursor:'child-more'});
    expect(picker.nextCursor()).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.context-pager')).toBeNull();
  });

  it('keeps groups as expandable containers when group selection is unavailable',async()=>{
    const fixture=await render({allowGroups:false});const picker=fixture.componentInstance;
    await picker.toggleBranch(major);await picker.toggleBranch(group);fixture.detectChanges();
    const root=fixture.nativeElement as HTMLElement;
    expect(root.querySelector('button[aria-label="Selecionar Trilha de desenvolvimento web"]')).toBeNull();
    expect(root.querySelector('button[aria-label="Selecionar Encontro da trilha"]')).not.toBeNull();
    expect(api.listPage).toHaveBeenLastCalledWith({parentKind:'EVENT_GROUP',parentId:'group-1',take:20});
  });

  it.each([
    [{kind:'major-event',id:'m'},'event','MAJOR_EVENT','EVENT'],
    [{kind:'major-event',id:'m'},'group','MAJOR_EVENT','EVENT_GROUP'],
    [{kind:'group',id:'g'},'event','EVENT_GROUP','EVENT'],
  ] as const)('preserves exact parent/child filters without exposing another level',async(parent,child,parentKind,childKind)=>{
    const fixture=await render({parentContext:parent,childKind:child,searchOnly:true});
    expect(api.listPage).toHaveBeenLastCalledWith({take:20,parentKind,parentId:parent.id,childKind});
    expect(fixture.componentInstance.canExpand(group)).toBe(false);
    await fixture.componentInstance.toggleBranch(group);expect(api.listPage).toHaveBeenCalledTimes(1);
  });

  it('preserves server relevance order, shows ancestry and resets paging/expansion on search',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;
    await picker.toggleBranch(major);await picker.nextPage();
    api.listPage.mockReturnValueOnce(of({nodes:[{...event,id:'z',name:'Zulu'}, {...event,id:'a',name:'Alfa'}],nextCursor:null}));
    picker.query.setValue('contexto',{emitEvent:false});await picker.search();fixture.detectChanges();
    expect(picker.results().map((node)=>node.id)).toEqual(['z','a']);expect(picker.cursorHistory()).toEqual([]);expect(picker.branches()).toEqual({});
    expect((fixture.nativeElement as HTMLElement).querySelector('.node-ancestry')?.textContent).toContain('Semana da Computação');
    expect(picker.canExpand(major)).toBe(false);
  });

  it('ignores root and branch responses from an older search generation',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;
    const branch=new Subject<AdminEventContextPage>();api.listPage.mockReturnValueOnce(branch);
    const loadingBranch=picker.toggleBranch(major);
    const oldRoot=new Subject<AdminEventContextPage>();api.listPage.mockReturnValueOnce(oldRoot);
    const oldSearch=picker.search();await flushAsync();
    picker.query.setValue('Oficina',{emitEvent:false});await picker.search();
    oldRoot.next({nodes:[major],nextCursor:null});oldRoot.complete();branch.next({nodes:[group],nextCursor:null});branch.complete();
    await oldSearch;await loadingBranch;
    expect(picker.results().map((node)=>node.id)).toEqual(['event-1']);expect(picker.branches()).toEqual({});
  });

  it('reports a failed child page and retries the complete collection',async()=>{
    let failed=true;
    api.listPage.mockImplementation((options:{parentKind?:string;childKind?:string;cursor?:string})=> {
      if(options.parentKind==='MAJOR_EVENT' && options.childKind==='EVENT') {
        if(options.cursor==='child-more' && failed) return throwError(()=>new Error('Unavailable'));
        return of(options.cursor==='child-more'
          ? {nodes:[{...event,id:'event-3',name:'Sessão complementar'}],nextCursor:null}
          : {nodes:[event],nextCursor:'child-more'});
      }
      return of(contextStoryPage(options as never));
    });
    const fixture=await render({parentContext:{kind:'major-event',id:'major-1'},childKind:'event',searchOnly:true});
    const picker=fixture.componentInstance;
    expect(picker.error()).toContain('Não foi possível carregar os contextos');
    expect(picker.results()).toEqual([]);
    failed=false;
    await picker.retryPage();
    expect(picker.results().map((node)=>node.id)).toEqual(['event-1','event-3']);
    expect(picker.error()).toBe('');
  });

  it('restarts root pagination after a pinned search cursor becomes unavailable',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;
    api.listPage.mockReturnValueOnce(throwError(()=>new Error('Restart search')));
    await picker.nextPage();expect(picker.error()).not.toBe('');
    await picker.retryPage();expect(api.listPage).toHaveBeenLastCalledWith({take:20});expect(picker.cursorHistory()).toEqual([]);
  });

  it('applies date and membership filters on the server and resets the old cursor', async () => {
    const fixture = await render({ searchOnly: true });
    const picker = fixture.componentInstance;
    await picker.nextPage();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    picker.filters.patchValue({ startDateFrom: start, isInGroup: 'YES', isInMajorEvent: 'NO' }, { emitEvent: false });
    await picker.search();
    expect(api.listPage).toHaveBeenLastCalledWith({
      take: 20, startDateFrom: expect.any(String), isInGroup: true, isInMajorEvent: false,
    });
    expect(picker.cursorHistory()).toEqual([]);
    expect(picker.canExpand(major)).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-event-filter-panel')).not.toBeNull();
    await picker.resetFilters();
    expect(api.listPage).toHaveBeenLastCalledWith({ take: 20 });
    expect(picker.filters.controls.startDateFrom.value).toBeNull();
  });

  it('retries a collapsed cancelled branch with a fresh request',async()=>{
    const fixture=await render();const picker=fixture.componentInstance;
    const pending=new Subject<AdminEventContextPage>();api.listPage.mockReturnValueOnce(pending);
    const loading=picker.toggleBranch(major);await picker.toggleBranch(major);
    pending.next({nodes:[group],nextCursor:null});pending.complete();await loading;
    expect(picker.branch(major)?.expanded).toBe(false);
    await picker.toggleBranch(major);expect(picker.branch(major)?.loading).toBe(false);expect(picker.branch(major)?.nodes).toHaveLength(3);
  });

  it('search-only dialogs skip detail hydration and disabled pickers cannot select or page',async()=>{
    const fixture=await render({context:{kind:'event',id:'event-1'},searchOnly:true,disabled:true});
    const picker=fixture.componentInstance;const selected=vi.fn();picker.contextChange.subscribe(selected);
    expect(events.getEvent).not.toHaveBeenCalled();expect((fixture.nativeElement as HTMLElement).querySelector('app-workspace-scope')).toBeNull();
    picker.choose(event);await picker.nextPage();expect(selected).not.toHaveBeenCalled();expect(api.listPage).toHaveBeenCalledTimes(1);
  });

  it('does not issue redundant requests when the shell owns context selection',async()=>{
    TestBed.overrideProvider(ADMIN_SHELL_CONTEXT,{useValue:true});
    await render({hideInShell:true,context:{kind:'event',id:'event-1'}});
    expect(api.listPage).not.toHaveBeenCalled();expect(events.getEvent).not.toHaveBeenCalled();
  });
});
