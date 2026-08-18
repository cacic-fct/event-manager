import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of, throwError } from 'rxjs';
import { SportsTeamOperationsPage } from './team-operations-page';
import { createRepresentativeTeamWorkspace, createSportsLineupRead } from './sports-operations.fixtures';
import type { SportsLineupRead } from './sports-operations.types';
import { SportsOperationsApiService } from './sports-operations-api.service';

describe('SportsTeamOperationsPage', () => {
  let submitTeamChange: ReturnType<typeof vi.fn>;
  let lineup: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    submitTeamChange = vi.fn(() => of('change-1'));
    lineup = vi.fn(() => of(createSportsLineupRead()));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ teamId: 'team-home' }), queryParamMap: convertToParamMap({}) } },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        {
          provide: SportsOperationsApiService,
          useValue: {
            submitTeamChange,
            lineup,
            representativeWorkspace: vi.fn(() => of(createRepresentativeTeamWorkspace())),
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('retains the member identifier when the submission fails', async () => {
    submitTeamChange.mockReturnValueOnce(throwError(() => new Error('Servidor indisponível')));
    const page = createPage();
    page.workspace.set(createRepresentativeTeamWorkspace());
    page.identityForm.setValue({ type: 'EMAIL', value: 'atleta@example.edu' });

    await page.addMember();

    expect(page.identityForm.controls.value.value).toBe('atleta@example.edu');
    expect(page.busy()).toBe(false);
  });

  it('ignores a late lineup response for a previously selected match', () => {
    const firstResponse = new Subject<SportsLineupRead>();
    const secondResponse = new Subject<SportsLineupRead>();
    lineup.mockImplementation((matchId: string) => (matchId === 'match-story' ? firstResponse : secondResponse));
    const page = createPage();
    page.workspace.set(createRepresentativeTeamWorkspace());

    page.selectMatch('match-story');
    page.selectMatch('match-finished');
    secondResponse.next({ ...createSportsLineupRead(), eligibleMembers: [] });
    expect(page.lineupMembers()).toEqual([]);

    firstResponse.next(createSportsLineupRead());

    expect(page.lineupMembers()).toEqual([]);
  });

  it('keeps a started match lineup read-only while loading its selected registration', () => {
    const workspace = createRepresentativeTeamWorkspace();
    const match = workspace.matches[0];
    if (!match) throw new Error('Expected a team match fixture.');
    pageWithStartedMatch(workspace, match.id);

    const page = createPage();
    page.workspace.set(workspace);
    page.selectMatch(match.id);

    expect(page.selectedMatchId()).toBe(match.id);
    expect(page.lineupReadOnly()).toBe(true);
    expect(lineup).toHaveBeenCalledWith(match.id, 'registration-home');
    expect(page.lineupMembers()).not.toHaveLength(0);
  });
});

function createPage(): SportsTeamOperationsPage {
  return TestBed.runInInjectionContext(() => new SportsTeamOperationsPage());
}

function pageWithStartedMatch(
  workspace: ReturnType<typeof createRepresentativeTeamWorkspace>,
  matchId: string,
): void {
  workspace.matches = workspace.matches.map((match) =>
    match.id === matchId ? { ...match, state: 'LIVE' as const } : match,
  );
}
