import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SportsWorkspaceService } from './sports-workspace.service';
import { SportsPageComponent } from './sports-page.component';

describe('SportsPageComponent legacy routes', () => {
  it('resolves a legacy tournament match URL and replaces it with the scoped URL', async () => {
    const params = new BehaviorSubject(convertToParamMap({
      legacyTournamentId: 'tournament-1',
      area: 'matches',
      categoryId: 'category-1',
      matchId: 'match-1',
    }));
    const { router, workspace } = await createComponent(params);

    await vi.waitFor(() => expect(workspace.loadTournament).toHaveBeenCalledWith('tournament-1'));
    await vi.waitFor(() => expect(router.navigate).toHaveBeenCalledOnce());

    expect(workspace.selectCategory).toHaveBeenCalledWith({ id: 'category-1' }, { navigate: false });
    expect(workspace.selectMatch).toHaveBeenCalledWith({ id: 'match-1' }, { navigate: false });
    expect(router.navigate).toHaveBeenCalledWith(
      ['/sports', 'major-event', 'major-1', 'matches', 'category-1', 'match-1'],
      { replaceUrl: true, queryParamsHandling: 'preserve', preserveFragment: true },
    );
  });

  it('does not redirect after a legacy tournament load finishes for an older route', async () => {
    const params = new BehaviorSubject(convertToParamMap({ legacyTournamentId: 'old-tournament' }));
    let finishLegacyLoad!: () => void;
    const legacyLoad = new Promise<void>((resolve) => {
      finishLegacyLoad = resolve;
    });
    const loadTournament = vi.fn(() => legacyLoad);
    const { router, workspace } = await createComponent(params, loadTournament);

    await vi.waitFor(() => expect(loadTournament).toHaveBeenCalledWith('old-tournament'));
    params.next(convertToParamMap({ majorEventId: 'major-2' }));
    await vi.waitFor(() => expect(workspace.loadMajorEventScope).toHaveBeenCalledWith('major-2'));
    finishLegacyLoad();
    await legacyLoad;
    await Promise.resolve();

    expect(router.navigate).not.toHaveBeenCalled();
  });
});

async function createComponent(
  params: BehaviorSubject<ReturnType<typeof convertToParamMap>>,
  loadTournament: (id: string) => Promise<void> = vi.fn(() => Promise.resolve()),
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
    loadTournament,
    loadMajorEventScope: vi.fn().mockResolvedValue(undefined),
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
    ],
  }).compileComponents();
  const component = TestBed.runInInjectionContext(() => new SportsPageComponent());

  return {
    component,
    router,
    workspace,
  };
}
