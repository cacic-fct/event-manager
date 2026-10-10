import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AdminRouteResourceErrorService } from '../shared/admin-route-resource-error.service';
import { SportsWorkspaceService } from './sports-workspace.service';
import { SportsPageComponent } from './sports-page.component';

describe('SportsPageComponent routes', () => {
  it('loads a major-event-scoped match URL without redirecting', async () => {
    const params = new BehaviorSubject(convertToParamMap({
      majorEventId: 'major-1',
      area: 'matches',
      entityId: 'category-1',
      matchId: 'match-1',
    }));
    const { router, workspace } = await createComponent(params);

    await vi.waitFor(() => expect(workspace.selectMatch).toHaveBeenCalledWith({ id: 'match-1' }, { navigate: false }));

    expect(workspace.loadMajorEventScope).toHaveBeenCalledWith('major-1');
    expect(workspace.selectCategory).toHaveBeenCalledWith({ id: 'category-1' }, { navigate: false });
    expect(workspace.activeArea()).toBe('matches');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not apply a selection after the major-event load finishes for an older route', async () => {
    const params = new BehaviorSubject(convertToParamMap({
      majorEventId: 'major-1',
      area: 'matches',
      entityId: 'category-1',
      matchId: 'match-1',
    }));
    let finishScopeLoad!: () => void;
    const scopeLoad = new Promise<void>((resolve) => {
      finishScopeLoad = resolve;
    });
    const loadMajorEventScope = vi.fn(() => scopeLoad);
    const { router, workspace } = await createComponent(params, loadMajorEventScope);

    await vi.waitFor(() => expect(loadMajorEventScope).toHaveBeenCalledWith('major-1'));
    params.next(convertToParamMap({}));
    await vi.waitFor(() => expect(workspace.resetWorkspaceRoute).toHaveBeenCalledOnce());
    finishScopeLoad();
    await scopeLoad;
    await Promise.resolve();

    expect(workspace.useMajorEventRouteScope).toHaveBeenCalledWith(null);
    expect(workspace.selectCategory).not.toHaveBeenCalled();
    expect(workspace.selectMatch).not.toHaveBeenCalled();
    expect(workspace.activeArea()).toBe('overview');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

async function createComponent(
  params: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  loadMajorEventScope: (id: string) => Promise<void> = vi.fn(() => Promise.resolve()),
) {
  const tournamentRead = signal({
    tournament: { majorEventId: 'major-1' },
    categories: [{ id: 'category-1' }],
  });
  const selectedCategoryId = signal('');
  const selectedMatchId = signal('');
  const categoryRead = signal<{ matches: Array<{ id: string }> } | null>(null);
  const matchReview = signal<unknown | null>(null);
  const workspace = {
    initialize: vi.fn().mockResolvedValue(undefined),
    loadMajorEventScope,
    tournamentRead,
    useMajorEventRouteScope: vi.fn(),
    activeArea: signal('overview'),
    selectedCategoryId,
    selectedMatchId,
    categoryRead,
    matchReview,
    selectCategory: vi.fn(async (category: { id: string }) => {
      selectedCategoryId.set(category.id);
      categoryRead.set({ matches: [{ id: 'match-1' }] });
    }),
    selectMatch: vi.fn(async (match: { id: string }) => {
      selectedMatchId.set(match.id);
      matchReview.set({ id: match.id });
    }),
    newCategory: vi.fn(),
    newTeam: vi.fn(),
    newMatch: vi.fn(),
    resetWorkspaceRoute: vi.fn(),
  } as unknown as SportsWorkspaceService;
  const router = { navigate: vi.fn().mockResolvedValue(true) } as unknown as Router;

  await TestBed.configureTestingModule({
    providers: [
      { provide: ActivatedRoute, useValue: { paramMap: params } },
      { provide: Router, useValue: router },
      { provide: SportsWorkspaceService, useValue: workspace },
      { provide: AdminRouteResourceErrorService, useValue: { redirectNotFound: vi.fn() } },
    ],
  }).compileComponents();
  const component = TestBed.runInInjectionContext(() => new SportsPageComponent());

  return {
    component,
    router,
    workspace,
  };
}
