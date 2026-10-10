import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { contextStoryPage } from './event-context-story.fixtures';
import { Component, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { of } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { EventContextDialogComponent, type EventContextDialogData, type EventContextDialogResult } from './event-context-dialog.component';
import { flushAsync } from '../testing/async-test-helpers';

@Component({ template: '<button type="button" (click)="open()">Escolher contexto</button>' })
class DialogHost {
  private readonly dialog = inject(MatDialog);
  readonly closed = vi.fn();
  data: EventContextDialogData = {context:{kind:'event',id:'current'},allowGroups:true};
  open(): void {
    this.dialog.open<EventContextDialogComponent, EventContextDialogData, EventContextDialogResult>(EventContextDialogComponent, {
      data: this.data, autoFocus:'input[type="search"]',
    }).afterClosed().subscribe(this.closed);
  }
}

describe('EventContextDialogComponent', () => {
  let fixture: ComponentFixture<DialogHost>;
  const events = {listEvents:vi.fn(()=>of([{id:'e1',name:'Oficina',emoji:'🧪',startDate:new Date().toISOString()}])),getEvent:vi.fn()};
  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({imports:[DialogHost],providers:[provideNoopAnimations(),provideRouter([]),
      {provide:AdminEventContextApiService,useValue:{listPage:vi.fn((options)=>of(contextStoryPage(options)))}},
      {provide:EventApiService,useValue:events},
      {provide:MajorEventApiService,useValue:{listMajorEvents:()=>of([]),getMajorEvent:vi.fn()}},
      {provide:EventGroupApiService,useValue:{listEventGroups:()=>of([{id:'g1',name:'Trilha',emoji:'🌐'}]),getEventGroup:vi.fn()}},
      {provide:PermissionsService,useValue:{evaluateWorkspacePermissions:async()=>undefined,has:()=>true}},
    ]}).compileComponents();
    fixture=TestBed.createComponent(DialogHost);fixture.detectChanges();
  });
  async function open() {
    const trigger=(fixture.nativeElement as HTMLElement).querySelector('button');
    trigger?.focus();trigger?.click();fixture.detectChanges();await fixture.whenStable();await flushAsync();
    return TestBed.inject(OverlayContainer).getContainerElement();
  }
  afterEach(()=>TestBed.inject(MatDialog).closeAll());

  it('offers only the relevant creation action in a parent-filtered child dialog', async () => {
    fixture.componentInstance.data={context:null,allowGroups:true,parentContext:{kind:'major-event',id:'parent'},childKind:'group'};
    const overlay=await open();
    expect(overlay.querySelector('h2')?.textContent).toContain('Grupos deste contexto');
    const labels=[...overlay.querySelectorAll('button')].map((button)=>button.textContent?.trim());
    expect(labels).toContain('Novo grupo');expect(labels).not.toContain('Novo evento');expect(labels).not.toContain('Novo grande evento');
    expect(events.listEvents).not.toHaveBeenCalled();
  });

  it('focuses search and returns the chosen entity without fetching the old detail', async () => {
    const overlay=await open();
    const input=overlay.querySelector('input[type="search"]');
    expect(input).not.toBeNull();expect(document.activeElement).toBe(input);
    expect(overlay.querySelector('app-workspace-scope')).toBeNull();
    expect(overlay.querySelector('nav')).toBeNull();
    expect(events.getEvent).not.toHaveBeenCalled();
    overlay.querySelector<HTMLButtonElement>('button[aria-label="Selecionar Semana da Computação"]')?.click();
    await fixture.whenStable();await flushAsync();
    expect(fixture.componentInstance.closed).toHaveBeenCalledWith({kind:'major-event',id:'major-1'});
  });

  it('returns a creation intent without selecting or navigating an existing entity', async () => {
    const overlay=await open();
    [...overlay.querySelectorAll('button')].find((button)=>button.textContent?.trim()==='Novo grupo')?.click();
    await fixture.whenStable();await flushAsync();
    expect(fixture.componentInstance.closed).toHaveBeenCalledWith({create:'group'});
  });

  it('cancels without replacing context and restores focus to the trigger', async () => {
    const overlay=await open();
    [...overlay.querySelectorAll('button')].find((button)=>button.textContent?.includes('Cancelar'))?.click();
    await fixture.whenStable();await flushAsync();
    expect(fixture.componentInstance.closed).toHaveBeenCalledWith(undefined);
    expect(document.activeElement).toBe((fixture.nativeElement as HTMLElement).querySelector('button'));
  });
});
