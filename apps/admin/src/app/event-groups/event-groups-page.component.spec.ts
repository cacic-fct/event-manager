import { By } from '@angular/platform-browser';
import { MatAnchor } from '@angular/material/button';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { of } from 'rxjs';
import { createPageStoryProviders, defaultPageStoryArgs } from '../stories/page-story-support';
import { createAdminEvent } from '../testing/admin-entity-fixtures';
import { PermissionsService } from '../permissions/permissions.service';
import { EventGroupsPageComponent } from './event-groups-page.component';
import { EventGroupsService } from './event-groups.service';

describe('EventGroupsPageComponent', () => {
  async function createFixture(
    permissions?: Partial<PermissionsService>,
    params: Record<string, string> = {},
    data: Record<string, string> = {},
  ) {
    await TestBed.configureTestingModule({
      imports: [EventGroupsPageComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        ...createPageStoryProviders(defaultPageStoryArgs),
        ...(permissions ? [{ provide: PermissionsService, useValue: permissions }] : []),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap(params)), snapshot: { data } } },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(EventGroupsService), 'pickEventGroupById');
    const fixture = TestBed.createComponent(EventGroupsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('loads the existing group identified by workspace route metadata', async () => {
    await createFixture(undefined, { targetId: 'workspace-group' }, { targetType: 'group', section: 'settings' });
    expect(TestBed.inject(EventGroupsService).pickEventGroupById).toHaveBeenCalledWith('workspace-group');
  });

  it('removes a linked activity without navigating or bubbling to the list', async () => {
    const fixture = await createFixture();
    const remove = vi.spyOn(fixture.componentInstance.workspace, 'removeEventFromSelectedGroup').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const record = (fixture.nativeElement as HTMLElement).querySelector('app-workspace-record');
    const action = record?.querySelector<HTMLButtonElement>('button[recordActions]');
    const rowClick = vi.fn();
    record?.parentElement?.addEventListener('click', rowClick);

    expect(action).not.toBeNull();
    action?.click();

    expect(remove).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(rowClick).not.toHaveBeenCalled();
  });

  it('renders linked activities as Material links to their event settings', async () => {
    const fixture = await createFixture();
    const links = fixture.debugElement.queryAll(By.directive(RouterLink)).filter((link) =>
      link.injector.get(RouterLink).urlTree?.toString().includes('/event-workspace/event/'),
    );

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.injector.get(MatAnchor, null)).not.toBeNull();
      expect(link.nativeElement.getAttribute('href')).toMatch(/^\/event-workspace\/event\/[^/]+\/settings$/);
    }
  });

  it('shows identity and linked activities before access and certificate rules', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const headings = [...element.querySelectorAll('h3')].map((heading) => heading.textContent?.trim());
    expect(headings.indexOf('Dados principais')).toBeLessThan(headings.indexOf('Eventos do grupo'));
    expect(headings.indexOf('Eventos do grupo')).toBeLessThan(headings.indexOf('Acesso e participação'));
    expect(headings.indexOf('Presença')).toBeLessThan(headings.indexOf('Certificados'));
  });

  it('discloses dependent certificate rules when issuance is enabled', async () => {
    const fixture = await createFixture();
    const controls = fixture.componentInstance.workspace.eventGroupForm.controls;
    controls.shouldIssuePartialCertificate.setValue(true);
    controls.shouldIssueCertificate.setValue(false);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[formcontrolname="shouldIssuePartialCertificate"]')).toBeNull();
    controls.shouldIssueCertificate.setValue(true);
    fixture.detectChanges();
    expect(element.querySelector('#certificados [formcontrolname="shouldIssuePartialCertificate"]')).not.toBeNull();
  });

  it('keeps resource actions after removing the duplicate group catalog', async () => {
    const fixture = await createFixture();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('aside')).toBeNull();
    expect([...element.querySelectorAll('button')].some((button) => button.textContent?.includes('Mais ações'))).toBe(true);
    expect(element.querySelector('#certificados')).not.toBeNull();
  });

  it('uses the selected group events when checking the freeze cutoff', async () => {
    const fixture = await createFixture({
      canEdit: () => true,
      canDelete: () => false,
      has: (permission) => permission !== Permission.Frozen.Update,
      hasAll: () => true,
    });
    const workspace = fixture.componentInstance.workspace;
    const group = workspace.selectedEventGroup();
    if (!group) throw new Error('The story fixture did not select an event group');

    const oldCreatedAt = new Date();
    oldCreatedAt.setDate(oldCreatedAt.getDate() - 150);
    workspace.selectedEventGroup.set({ ...group, createdAt: oldCreatedAt.toISOString() });
    workspace.eventSummaries.set([]);
    const currentDate = new Date().toISOString();
    workspace.eventGroupEvents.set([
      createAdminEvent({ eventGroupId: group.id, createdAt: currentDate, endDate: currentDate, publicationState: 'PUBLISHED' }),
    ]);
    fixture.detectChanges();

    const publicationActions = (fixture.nativeElement as HTMLElement).querySelector('.editor-action-group--publication');
    expect(publicationActions?.textContent).toContain('Voltar para rascunho');
    expect(publicationActions?.textContent).toContain('Atualizar publicação');
  });
});
