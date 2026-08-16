import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import type {
  PublicationActionResult,
  PublicationNode,
  PublicationPreviewResult,
  PublicationWorkspace,
} from '../graphql/publishing-api.service';
import { PublicationApiService } from '../graphql/publishing-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { adminFixtureDate, adminFixtureDateFromNow } from '../testing/admin-entity-fixtures';
import { PublicationPageComponent } from './publication-page.component';

describe('PublicationPageComponent', () => {
  let api: {
    getWorkspace: ReturnType<typeof vi.fn>;
    setPublicationState: ReturnType<typeof vi.fn>;
    runBulkOperation: ReturnType<typeof vi.fn>;
    createPreview: ReturnType<typeof vi.fn>;
  };
  let dialog: { open: ReturnType<typeof vi.fn> };
  let snackBar: { open: ReturnType<typeof vi.fn> };
  let feedback: { showErrorMessage: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let routeParamMap = convertToParamMap({});

  beforeEach(() => {
    api = {
      getWorkspace: vi.fn(() => of(workspaceFixture())),
      setPublicationState: vi.fn(() => of(actionFixture('Estado atualizado.'))),
      runBulkOperation: vi.fn(() => of(actionFixture('Operação concluída.'))),
      createPreview: vi.fn(() => of(previewFixture())),
    };
    dialog = {
      open: vi.fn(() => ({ afterClosed: () => of(true) })),
    };
    snackBar = { open: vi.fn() };
    feedback = { showErrorMessage: vi.fn() };
    router = { navigate: vi.fn(() => Promise.resolve(true)) };

    TestBed.configureTestingModule({
      imports: [PublicationPageComponent],
      providers: [
        provideNoopAnimations(),
        { provide: PublicationApiService, useValue: api },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: AdminFeedbackService, useValue: feedback },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { paramMap: of(routeParamMap) } },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    routeParamMap = convertToParamMap({});
  });

  it('loads the workspace, selects the first item, and exposes warning and pagination projections', async () => {
    const { component } = await createComponent();

    expect(api.getWorkspace).toHaveBeenCalledWith({
      query: null,
      skip: 0,
      take: 50,
      focusTargetType: null,
      focusTargetId: null,
    });
    expect(component.selectedNode()?.id).toBe('major-1');
    expect(component.workspaceItems().map((node) => node.id)).toEqual(['major-1', 'group-1', 'event-1']);
    expect(component.workspaceListItems().map((item) => item.level)).toEqual([0, 1, 2]);
    expect(component.paginationLabel()).toBe('1-3 de 3');
    expect(component.selectedWarnings()).toEqual([expect.objectContaining({ targetId: 'major-1' })]);
    expect(component.targetIcon('MAJOR_EVENT')).toBe('festival');
    expect(component.targetLabel('EVENT_GROUP')).toBe('Grupo de eventos');
    expect(component.childCountLabel(2)).toBe('2 itens vinculados');
  });

  it('honors a parameterized publication deep link and normalizes the target type', async () => {
    routeParamMap = convertToParamMap({ targetType: 'event-group', targetId: 'group-1' });

    const { component } = await createComponent();

    expect(component.selectedNode()?.id).toBe('group-1');
    expect(api.getWorkspace).toHaveBeenCalledWith({
      query: null,
      skip: 0,
      take: 50,
      focusTargetType: 'EVENT_GROUP',
      focusTargetId: 'group-1',
    });
  });

  it('trims searches, resets the page, clears searches, and guards pagination boundaries', async () => {
    api.getWorkspace.mockReturnValue(of(workspaceFixture({ hasMore: true })));
    const { component } = await createComponent();
    component.pageIndex.set(2);
    component.filterForm.controls.query.setValue('  evento  ');

    await component.applySearch();

    expect(component.query()).toBe('evento');
    expect(component.pageIndex()).toBe(0);
    expect(api.getWorkspace).toHaveBeenLastCalledWith({
      query: 'evento',
      skip: 0,
      take: 50,
      focusTargetType: null,
      focusTargetId: null,
    });

    await component.nextPage();
    expect(component.pageIndex()).toBe(1);
    expect(api.getWorkspace).toHaveBeenLastCalledWith({
      query: 'evento',
      skip: 50,
      take: 50,
      focusTargetType: null,
      focusTargetId: null,
    });

    await component.previousPage();
    expect(component.pageIndex()).toBe(0);
    await component.previousPage();
    expect(component.pageIndex()).toBe(0);

    await component.clearSearch();
    expect(component.filterForm.controls.query.value).toBe('');
    expect(component.query()).toBe('');
    expect(component.pageIndex()).toBe(0);
    expect(api.getWorkspace).toHaveBeenLastCalledWith({
      query: null,
      skip: 0,
      take: 50,
      focusTargetType: null,
      focusTargetId: null,
    });
  });

  it('maps publish, draft, unpublish, and schedule actions and refetches after success', async () => {
    const { component } = await createComponent();
    const scheduledAt = adminFixtureDateFromNow(2).slice(0, 16);

    await component.publishSelected();
    await component.draftSelected();
    await component.unpublishSelected();
    component.actionForm.controls.scheduledPublishAt.setValue(scheduledAt);
    await component.scheduleSelected();

    expect(api.setPublicationState).toHaveBeenNthCalledWith(1, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      state: 'PUBLISHED',
      scheduledPublishAt: null,
    });
    expect(api.setPublicationState).toHaveBeenNthCalledWith(2, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      state: 'DRAFT',
      scheduledPublishAt: null,
    });
    expect(api.setPublicationState).toHaveBeenNthCalledWith(3, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      state: 'UNPUBLISHED',
      scheduledPublishAt: null,
    });
    expect(api.setPublicationState).toHaveBeenNthCalledWith(4, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      state: 'SCHEDULED',
      scheduledPublishAt: new Date(scheduledAt).toISOString(),
    });
    expect(api.getWorkspace).toHaveBeenCalledTimes(5);
    expect(snackBar.open).toHaveBeenCalledWith('Estado atualizado.', 'Fechar', { duration: 4000 });
    expect(component.loading()).toBe(false);
  });

  it('blocks scheduling when the schedule field is invalid', async () => {
    const { component } = await createComponent();
    component.actionForm.controls.scheduledPublishAt.setValue('');

    await component.scheduleSelected();
    await component.scheduleBundle();

    expect(component.actionForm.controls.scheduledPublishAt.touched).toBe(true);
    expect(api.setPublicationState).not.toHaveBeenCalled();
    expect(api.runBulkOperation).not.toHaveBeenCalled();
  });

  it('confirms bulk operations, maps schedule input, and skips mutations when canceled', async () => {
    const { component } = await createComponent();
    const scheduledAt = adminFixtureDateFromNow(2).slice(0, 16);
    component.actionForm.controls.scheduledPublishAt.setValue(scheduledAt);

    await component.scheduleBundle();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        width: '460px',
        data: expect.objectContaining({
          title: 'Agendar conjunto de Grande evento?',
          confirmLabel: 'Agendar conjunto',
        }),
      }),
    );
    expect(api.runBulkOperation).toHaveBeenNthCalledWith(1, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      operation: 'SCHEDULE_BUNDLE',
      scheduledPublishAt: new Date(scheduledAt).toISOString(),
    });

    dialog.open.mockReturnValueOnce({ afterClosed: () => of(false) });
    await component.unpublishBundle();
    expect(api.runBulkOperation).toHaveBeenCalledTimes(1);

    await component.publishMissingChildren();
    expect(api.runBulkOperation).toHaveBeenNthCalledWith(2, {
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      operation: 'PUBLISH_MISSING_CHILDREN',
      scheduledPublishAt: null,
    });
    expect(dialog.open).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ confirmLabel: 'Publicar pendentes' }),
      }),
    );
  });

  it('previews a selected item, opens the temporary URL, and validates the preview field', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { component } = await createComponent();
    const previewAt = adminFixtureDateFromNow(3, 9).slice(0, 16);
    component.actionForm.controls.previewAt.setValue(previewAt);

    await component.previewSelected();

    expect(api.createPreview).toHaveBeenCalledWith({
      targetType: 'MAJOR_EVENT',
      targetId: 'major-1',
      previewAt: new Date(previewAt).toISOString(),
    });
    expect(snackBar.open).toHaveBeenCalledWith('Preview criado.', 'Fechar', { duration: 5000 });
    expect(open).toHaveBeenCalledWith('https://preview.example/major-1', '_blank', 'noopener');

    component.actionForm.controls.previewAt.setValue('');
    await component.previewSelected();
    expect(component.actionForm.controls.previewAt.touched).toBe(true);
    expect(api.createPreview).toHaveBeenCalledTimes(1);
  });

  it('reports refresh, mutation, and preview failures and always clears loading', async () => {
    api.getWorkspace.mockReturnValueOnce(throwError(() => new Error('workspace unavailable')));
    const { component } = await createComponent();
    expect(feedback.showErrorMessage).toHaveBeenCalledWith('workspace unavailable');
    expect(component.loading()).toBe(false);

    api.setPublicationState.mockReturnValueOnce(throwError(() => new Error('cannot publish')));
    component.selectedNode.set(majorNode());
    await component.publishSelected();
    expect(feedback.showErrorMessage).toHaveBeenLastCalledWith('cannot publish');
    expect(component.loading()).toBe(false);

    api.createPreview.mockReturnValueOnce(throwError(() => new Error('preview unavailable')));
    component.selectedNode.set(eventNode());
    await component.previewSelected();
    expect(feedback.showErrorMessage).toHaveBeenLastCalledWith('preview unavailable');
    expect(component.loading()).toBe(false);
  });

  it('routes each selected target to its editor and does nothing without a selection', async () => {
    const { component } = await createComponent();

    component.selectNode(eventNode());
    component.openEditor();
    component.selectNode(groupNode());
    component.openEditor();
    component.selectNode(majorNode());
    component.openEditor();

    expect(router.navigate).toHaveBeenNthCalledWith(1, ['/events', 'event-1']);
    expect(router.navigate).toHaveBeenNthCalledWith(2, ['/groups', 'group-1']);
    expect(router.navigate).toHaveBeenNthCalledWith(3, ['/major-events', 'major-1']);

    component.selectedNode.set(null);
    component.openEditor();
    await component.publishSelected();
    expect(router.navigate).toHaveBeenCalledTimes(3);
    expect(api.setPublicationState).not.toHaveBeenCalled();
  });

  async function createComponent(): Promise<{
    component: PublicationPageComponent;
    fixture: ComponentFixture<PublicationPageComponent>;
  }> {
    TestBed.overrideProvider(ActivatedRoute, { useValue: { paramMap: of(routeParamMap) } });
    const fixture = TestBed.createComponent(PublicationPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    return { component: fixture.componentInstance, fixture };
  }
});

function workspaceFixture(overrides: Partial<PublicationWorkspace> = {}): PublicationWorkspace {
  return {
    generatedAt: adminFixtureDate,
    tree: [majorNode()],
    items: [],
    totalCount: 3,
    skip: 0,
    take: 50,
    hasMore: false,
    query: null,
    warnings: [
      {
        type: 'MISSING_CHILD',
        action: 'PUBLISH',
        targetId: 'major-1',
        severity: 'WARNING',
        title: 'Há itens pendentes',
        description: 'Revise os itens vinculados.',
        eventId: null,
        relatedEventId: null,
        personId: null,
      },
    ],
    ...overrides,
  } as PublicationWorkspace;
}

function majorNode(): PublicationNode {
  return {
    targetType: 'MAJOR_EVENT',
    id: 'major-1',
    label: 'Grande evento',
    publicationState: 'DRAFT',
    statusLabel: 'Rascunho',
    isPubliclyListed: true,
    parentLabel: null,
    childCount: 1,
    children: [groupNode()],
  };
}

function groupNode(): PublicationNode {
  return {
    targetType: 'EVENT_GROUP',
    id: 'group-1',
    label: 'Grupo',
    publicationState: 'PUBLISHED',
    statusLabel: 'Publicado',
    isPubliclyListed: true,
    parentLabel: 'Grande evento',
    childCount: 1,
    children: [eventNode()],
  };
}

function eventNode(): PublicationNode {
  return {
    targetType: 'EVENT',
    id: 'event-1',
    label: 'Evento',
    publicationState: 'PUBLISHED',
    statusLabel: 'Publicado',
    isPubliclyListed: true,
    parentLabel: 'Grupo',
    childCount: 0,
  };
}

function actionFixture(message: string): PublicationActionResult {
  return {
    ok: true,
    message,
    affectedEventIds: ['event-1'],
    affectedMajorEventIds: ['major-1'],
  };
}

function previewFixture(): PublicationPreviewResult {
  return {
    url: 'https://preview.example/major-1',
    directPublicUrl: false,
    expiresAt: adminFixtureDateFromNow(0, 13),
    message: 'Preview criado.',
  };
}
