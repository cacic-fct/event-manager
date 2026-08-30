import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject, of, throwError } from 'rxjs';
import { SportsTeamOperationsPage } from './team-operations-page';
import { createRepresentativeTeamWorkspace, createSportsLineupRead } from './sports-operations.fixtures';
import type { SportsLineupRead } from './sports-operations.types';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsOperationsRealtimeService } from './sports-operations-realtime.service';

describe('SportsTeamOperationsPage', () => {
  let submitTeamChange: ReturnType<typeof vi.fn>;
  let lineup: ReturnType<typeof vi.fn>;
  let realtimeStreams: Subject<void>[];
  let watchRepresentativeTeam: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    submitTeamChange = vi.fn(() => of('change-1'));
    lineup = vi.fn(() => of(createSportsLineupRead()));
    realtimeStreams = [];
    watchRepresentativeTeam = vi.fn(() => {
      const stream = new Subject<void>();
      realtimeStreams.push(stream);
      return stream;
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ teamId: 'team-home' }), queryParamMap: convertToParamMap({}) },
          },
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
        { provide: SportsOperationsRealtimeService, useValue: { watchRepresentativeTeam } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

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

  it('refreshes the selected workspace and lineup while preserving profile and member drafts', async () => {
    vi.useFakeTimers();
    const initialWorkspace = createRepresentativeTeamWorkspace();
    const refreshedWorkspace = createRepresentativeTeamWorkspace();
    refreshedWorkspace.teamRevision = initialWorkspace.teamRevision + 1;
    refreshedWorkspace.matches = refreshedWorkspace.matches.map((match) =>
      match.id === 'match-story' ? { ...match, state: 'CHECK_IN' as const } : match,
    );
    const refreshedLineup = createSportsLineupRead({ selected: false });
    const representativeWorkspace = TestBed.inject(SportsOperationsApiService).representativeWorkspace as ReturnType<
      typeof vi.fn
    >;
    representativeWorkspace.mockReturnValueOnce(of(initialWorkspace)).mockReturnValueOnce(of(refreshedWorkspace));
    lineup.mockReturnValueOnce(of(createSportsLineupRead())).mockReturnValueOnce(of(refreshedLineup));
    const page = createPage();
    page.ngOnInit();

    page.profileForm.controls.name.setValue('Nome editado localmente');
    page.profileForm.markAsDirty();
    page.identityForm.controls.value.setValue('atleta@example.edu');
    realtimeStreams[0]?.next();
    await vi.advanceTimersByTimeAsync(75);

    expect(page.workspace()?.teamRevision).toBe(refreshedWorkspace.teamRevision);
    expect(page.selectedMatch()?.state).toBe('CHECK_IN');
    expect(page.profileForm.controls.name.value).toBe('Nome editado localmente');
    expect(page.identityForm.controls.value.value).toBe('atleta@example.edu');
    expect(page.lineupMembers().every((member) => !member.selected)).toBe(true);
    expect(watchRepresentativeTeam).toHaveBeenCalledWith('team-home');
  });

  it('reconnects the selected public match stream after terminal failure through an authenticated refresh', () => {
    const workspace = createRepresentativeTeamWorkspace();
    const representativeWorkspace = TestBed.inject(SportsOperationsApiService).representativeWorkspace as ReturnType<
      typeof vi.fn
    >;
    representativeWorkspace.mockReturnValue(of(workspace));
    const page = createPage();
    page.ngOnInit();
    const firstStream = realtimeStreams[0];
    if (!firstStream) throw new Error('Expected the initial realtime subscription.');
    firstStream.error(new Error('closed'));

    expect(representativeWorkspace).toHaveBeenCalledTimes(2);
    expect(watchRepresentativeTeam).toHaveBeenCalledTimes(2);
  });

  it('lets only the newest workspace request settle realtime recovery', () => {
    const workspace = createRepresentativeTeamWorkspace();
    const staleRecovery = new Subject<ReturnType<typeof createRepresentativeTeamWorkspace>>();
    const currentLoad = new Subject<ReturnType<typeof createRepresentativeTeamWorkspace>>();
    const representativeWorkspace = TestBed.inject(SportsOperationsApiService).representativeWorkspace as ReturnType<
      typeof vi.fn
    >;
    representativeWorkspace
      .mockReturnValueOnce(of(workspace))
      .mockReturnValueOnce(staleRecovery)
      .mockReturnValueOnce(currentLoad);
    const page = createPage();
    page.ngOnInit();
    const firstStream = realtimeStreams[0];
    if (!firstStream) throw new Error('Expected the initial realtime subscription.');

    firstStream.error(new Error('closed'));
    page.load({ preserveDrafts: true });
    expect(watchRepresentativeTeam).toHaveBeenCalledOnce();

    staleRecovery.next(workspace);
    staleRecovery.complete();

    expect(watchRepresentativeTeam).toHaveBeenCalledOnce();

    currentLoad.next(workspace);
    currentLoad.complete();

    expect(watchRepresentativeTeam).toHaveBeenCalledTimes(2);
  });

  it('stops reacting to the selected match stream after destruction', async () => {
    vi.useFakeTimers();
    const page = createPage();
    page.ngOnInit();
    const representativeWorkspace = TestBed.inject(SportsOperationsApiService).representativeWorkspace as ReturnType<
      typeof vi.fn
    >;
    page.ngOnDestroy();
    realtimeStreams[0]?.next();
    await vi.advanceTimersByTimeAsync(76);

    expect(representativeWorkspace).toHaveBeenCalledOnce();
  });

  it('does not open a public match stream during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const page = createPage();

    page.ngOnInit();

    expect(watchRepresentativeTeam).not.toHaveBeenCalled();
  });
});

function createPage(): SportsTeamOperationsPage {
  return TestBed.runInInjectionContext(() => new SportsTeamOperationsPage());
}

function pageWithStartedMatch(workspace: ReturnType<typeof createRepresentativeTeamWorkspace>, matchId: string): void {
  workspace.matches = workspace.matches.map((match) =>
    match.id === matchId ? { ...match, state: 'LIVE' as const } : match,
  );
}
