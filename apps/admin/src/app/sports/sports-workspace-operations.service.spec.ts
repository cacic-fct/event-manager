import { TestBed } from '@angular/core/testing';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { EventFormApiService } from '../graphql/event-form-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { SportsApiService } from './sports-api.service';
import {
  createAdminSportsApplications,
  createAdminSportsCategory,
  createAdminSportsCategoryRead,
  createAdminSportsMatchReview,
  createAdminSportsPendingMatchActions,
  createAdminSportsRegistrationRead,
  createAdminSportsTeamRead,
  createAdminSportsTournamentRead,
} from './sports-story.fixtures';
import { SportsWorkspaceService } from './sports-workspace.service';

describe('SportsWorkspaceService operations', () => {
  const api = {
    mutate: vi.fn(),
    deleteVersioned: vi.fn(),
    uploadTeamLogo: vi.fn(),
    category: vi.fn(),
    team: vi.fn(),
    tournament: vi.fn(),
    tournaments: vi.fn(),
    applicationQueue: vi.fn(),
    matchActionReviewQueue: vi.fn(),
    matchReview: vi.fn(),
    registration: vi.fn(),
    reviewApplication: vi.fn(),
    reviewTeamChange: vi.fn(),
    reviewMatchAction: vi.fn(),
    watchTournamentReview: vi.fn(),
  };
  const snackbar = { open: vi.fn() };
  const dialog = { open: vi.fn() };
  let workspace: SportsWorkspaceService;

  beforeEach(() => {
    vi.clearAllMocks();
    api.mutate.mockReturnValue(of('saved-id'));
    api.deleteVersioned.mockReturnValue(of(true));
    api.uploadTeamLogo.mockReturnValue(of(true));
    api.watchTournamentReview.mockReturnValue(EMPTY);
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        SportsWorkspaceService,
        { provide: SportsApiService, useValue: api },
        { provide: MajorEventApiService, useValue: {} },
        { provide: EventFormApiService, useValue: {} },
        { provide: PeopleApiService, useValue: {} },
        { provide: PlacePresetApiService, useValue: {} },
        { provide: PermissionsService, useValue: { has: vi.fn(() => true), hasAny: vi.fn(() => true) } },
        { provide: MatSnackBar, useValue: snackbar },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    workspace = TestBed.inject(SportsWorkspaceService);
    workspace.tournamentRead.set(createAdminSportsTournamentRead());
  });

  describe('categories', () => {
    it('creates a category from structured form values and reselects the returned category', async () => {
      const category = createAdminSportsCategory(1);
      const tournament = createAdminSportsTournamentRead();
      tournament.categories = [category];
      workspace.tournamentRead.set(tournament);
      workspace.newCategory();
      workspace.categoryForm.patchValue({
        name: category.name,
        emoji: category.eventGroup?.emoji,
        sport: category.sport,
        format: category.format,
        status: category.status,
      });
      api.mutate.mockReturnValue(of(category.id));
      vi.spyOn(workspace, 'loadTournament').mockImplementation(async () => workspace.tournamentRead.set(tournament));
      const select = vi.spyOn(workspace, 'selectCategory').mockResolvedValue();

      await workspace.saveCategory();

      expect(api.mutate).toHaveBeenCalledWith(
        'createSportsCategory',
        'SportsCategoryCreateInput',
        expect.objectContaining({ tournamentId: 'tournament-1', name: category.name, sport: category.sport }),
      );
      expect(select).toHaveBeenCalledWith(category);
    });

    it('updates a selected category with optimistic revision data', async () => {
      const read = createAdminSportsCategoryRead();
      workspace.categoryRead.set(read);
      workspace.categoryForm.patchValue({ name: 'Futebol revisado', sport: 'SOCCER' });
      api.mutate.mockReturnValue(of(read.category.id));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      vi.spyOn(workspace, 'selectCategory').mockResolvedValue();

      await workspace.saveCategory();

      expect(api.mutate).toHaveBeenCalledWith(
        'updateSportsCategory',
        'SportsCategoryUpdateInput',
        expect.objectContaining({ id: read.category.id, expectedRevision: read.category.revision }),
      );
    });

    it('deletes only after confirmation and resets the selection', async () => {
      const category = createAdminSportsCategory();
      const reset = vi.spyOn(workspace, 'newCategory');
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.deleteCategory(category);

      expect(api.deleteVersioned).toHaveBeenCalledWith('deleteSportsCategory', category.id, category.revision);
      expect(reset).toHaveBeenCalled();
    });

    it('clones a category locally without registrations or stages', async () => {
      const read = createAdminSportsCategoryRead();
      workspace.categoryRead.set(read);
      dialog.open.mockReturnValue({ afterClosed: () => of('tournament-1') });
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.cloneSelectedCategory();

      expect(api.mutate).toHaveBeenCalledWith('cloneSportsCategory', 'SportsCategoryCloneInput', {
        sourceCategoryId: read.category.id,
        destinationTournamentId: 'tournament-1',
        name: `${read.category.name} (cópia)`,
        includeRegistrations: false,
        includeStages: false,
        includeOfficials: true,
      });
      expect(workspace.loadTournament).toHaveBeenCalled();
    });
  });

  describe('teams', () => {
    it('creates and then opens the saved team', async () => {
      const tournament = createAdminSportsTournamentRead({ teamCount: 1 });
      const team = tournament.teams[0];
      const institution = team.institution ?? '';
      workspace.tournamentRead.set(tournament);
      workspace.newTeam();
      workspace.teamForm.patchValue({ name: team.name, institution, status: team.status });
      api.mutate.mockReturnValue(of(team.id));
      vi.spyOn(workspace, 'loadTournament').mockImplementation(async () => workspace.tournamentRead.set(tournament));
      const select = vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.saveTeam();

      expect(api.mutate).toHaveBeenCalledWith('createSportsTeam', 'SportsTeamCreateInput', {
        tournamentId: 'tournament-1',
        name: team.name,
        institution,
        status: team.status,
      });
      expect(select).toHaveBeenCalledWith(team);
    });

    it('rejects unsupported or oversized logo files before upload', async () => {
      workspace.teamRead.set(createAdminSportsTeamRead());

      await workspace.uploadTeamLogo(new File(['text'], 'shield.txt', { type: 'text/plain' }));
      await workspace.uploadTeamLogo(
        new File([new Uint8Array(15 * 1024 * 1024 + 1)], 'shield.png', { type: 'image/png' }),
      );

      expect(api.uploadTeamLogo).not.toHaveBeenCalled();
      expect(snackbar.open).toHaveBeenCalledTimes(2);
    });

    it('uploads a supported logo and refreshes the selected team', async () => {
      const read = createAdminSportsTeamRead();
      workspace.teamRead.set(read);
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      const select = vi.spyOn(workspace, 'selectTeam').mockResolvedValue();
      const file = new File(['shield'], 'shield.svg', { type: 'image/svg+xml' });

      await workspace.uploadTeamLogo(file);

      expect(api.uploadTeamLogo).toHaveBeenCalledWith(read.team.id, read.team.revision, file);
      expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: read.team.id }));
    });

    it('searches normalized people queries and clears short searches', async () => {
      const peopleApi = TestBed.inject(PeopleApiService) as unknown as {
        listPeopleSummaries: ReturnType<typeof vi.fn>;
      };
      peopleApi.listPeopleSummaries = vi.fn().mockReturnValue(of([{ id: 'person-1', name: 'Ana Souza' }]));

      await workspace.searchPeople('  Ana  ', 'member');
      expect(peopleApi.listPeopleSummaries).toHaveBeenCalledWith({ query: 'Ana', take: 10 });
      expect(workspace.peopleTarget()).toBe('member');

      await workspace.searchPeople(' A ', 'member');
      expect(workspace.people()).toEqual([]);
      expect(workspace.peopleTarget()).toBeNull();
    });

    it('updates a member status using its current revision', async () => {
      const read = createAdminSportsTeamRead();
      const member = read.members[0];
      workspace.teamRead.set(read);
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.updateTeamMember(member, 'SUSPENDED');

      expect(api.mutate).toHaveBeenCalledWith('updateSportsTeamMember', 'SportsTeamMemberUpdateInput', {
        id: member.id,
        expectedRevision: member.revision,
        status: 'SUSPENDED',
      });
    });

    it('saves category-scoped shirt and game identity fields without conflating them', async () => {
      const read = createAdminSportsTeamRead();
      const [shirtAssignment, gameAssignment] = read.members[0].categoryAssignments;
      workspace.teamRead.set(read);
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.updateShirtNumber(shirtAssignment, ' 11 ');
      expect(api.mutate).toHaveBeenCalledWith(
        'updateSportsRegistrationMemberProfile',
        'SportsRegistrationMemberProfileUpdateInput',
        {
          registrationMemberId: shirtAssignment.registrationMemberId,
          shirtNumber: '11',
        },
      );

      await workspace.updateGameProfile(gameAssignment, ' Fênix ', ' fenix#BR1 ', ' https://example.com/fenix ');
      expect(api.mutate).toHaveBeenLastCalledWith(
        'updateSportsRegistrationMemberProfile',
        'SportsRegistrationMemberProfileUpdateInput',
        {
          registrationMemberId: gameAssignment.registrationMemberId,
          gameNickname: 'Fênix',
          gameAccountName: 'fenix#BR1',
          gameAccountUrl: 'https://example.com/fenix',
        },
      );
    });

    it('assigns representatives and members from the selected people fixture', async () => {
      const read = createAdminSportsTeamRead();
      workspace.teamRead.set(read);
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();
      workspace.representativeForm.patchValue({ personId: 'person-1', personQuery: 'Ana Souza' });

      await workspace.assignRepresentative();

      expect(api.mutate).toHaveBeenCalledWith('assignSportsTeamRepresentative', 'SportsRepresentativeAssignInput', {
        teamId: read.team.id,
        personId: 'person-1',
      });

      workspace.memberForm.patchValue({ personId: 'person-2', personQuery: 'Bruno Oliveira' });
      await workspace.addTeamMember();
      expect(api.mutate).toHaveBeenLastCalledWith('createSportsTeamMember', 'SportsTeamMemberCreateInput', {
        teamId: read.team.id,
        personId: 'person-2',
      });
    });

    it('creates a registration and assigns only approved team members', async () => {
      const read = createAdminSportsTeamRead();
      workspace.teamRead.set(read);
      workspace.registrationForm.patchValue({
        teamId: read.team.id,
        categoryId: 'category-2',
        seed: 4,
        formAnswersJson: '[]',
      });
      api.mutate.mockReturnValue(of('registration-new'));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.createRegistration();

      expect(api.mutate).toHaveBeenCalledWith('createSportsRegistration', 'SportsRegistrationCreateInput', {
        teamId: read.team.id,
        categoryId: 'category-2',
        seed: 4,
        formAnswersJson: null,
      });
      expect(api.mutate).toHaveBeenCalledWith('assignSportsCategoryRole', 'SportsRegistrationMemberUpsertInput', {
        registrationId: 'registration-new',
        teamMemberId: 'member-1',
        role: 'PLAYER',
      });
    });

    it('updates an existing registration questionnaire instead of creating a duplicate', async () => {
      const read = createAdminSportsTeamRead();
      const existing = read.registrations[0];
      workspace.teamRead.set(read);
      workspace.registrationForm.patchValue({
        teamId: read.team.id,
        categoryId: existing.categoryId,
        seed: existing.seed ?? 0,
        formAnswersJson: '[{"answer":"updated"}]',
      });
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.createRegistration();

      expect(api.mutate).toHaveBeenCalledWith('updateSportsRegistration', 'SportsRegistrationUpdateInput', {
        id: existing.id,
        expectedRevision: existing.revision,
        formAnswersJson: '[{"answer":"updated"}]',
      });
      expect(api.mutate).not.toHaveBeenCalledWith(
        'createSportsRegistration',
        'SportsRegistrationCreateInput',
        expect.anything(),
      );
    });

    it('clears a picked person when the operator edits the search text', async () => {
      const peopleApi = TestBed.inject(PeopleApiService) as unknown as {
        listPeopleSummaries: ReturnType<typeof vi.fn>;
      };
      peopleApi.listPeopleSummaries = vi.fn().mockReturnValue(of([]));
      workspace.pickPerson({ id: 'person-1', name: 'Ana Souza' } as never, 'member');
      workspace.memberForm.controls.personQuery.setValue('Bruno');

      await workspace.searchPeople('Bruno', 'member');

      expect(workspace.memberForm.controls.personId.value).toBe('');
      expect(workspace.memberForm.controls.personQuery.value).toBe('Bruno');
    });

    it('does not let an older people search replace the latest result', async () => {
      const peopleApi = TestBed.inject(PeopleApiService) as unknown as {
        listPeopleSummaries: ReturnType<typeof vi.fn>;
      };
      const first = new Subject<never[]>();
      const second = new Subject<never[]>();
      peopleApi.listPeopleSummaries = vi.fn(({ query }: { query: string }) => (query === 'Ana' ? first : second));

      const firstSearch = workspace.searchPeople('Ana', 'member');
      const secondSearch = workspace.searchPeople('Bia', 'member');
      second.next([{ id: 'person-bia', name: 'Bia' }] as never[]);
      second.complete();
      first.next([{ id: 'person-ana', name: 'Ana' }] as never[]);
      first.complete();
      await Promise.all([firstSearch, secondSearch]);

      expect(workspace.people()).toEqual([{ id: 'person-bia', name: 'Bia' }]);
    });

    it('ignores a category response after the operator starts a new category draft', async () => {
      const pending = new Subject<ReturnType<typeof createAdminSportsCategoryRead>>();
      const category = createAdminSportsCategory(0);
      const read = createAdminSportsCategoryRead(category);
      workspace.tournamentRead.set(createAdminSportsTournamentRead());
      api.category.mockReturnValue(pending);

      const selection = workspace.selectCategory(category, { navigate: false });
      workspace.newCategory(false);
      pending.next(read);
      pending.complete();
      await selection;

      expect(workspace.categoryRead()).toBeNull();
      expect(workspace.selectedCategoryId()).toBe('');
    });

    it('keeps the loading state active until overlapping category loads all finish', async () => {
      const first = new Subject<ReturnType<typeof createAdminSportsCategoryRead>>();
      const second = new Subject<ReturnType<typeof createAdminSportsCategoryRead>>();
      const firstCategory = createAdminSportsCategory(0);
      const secondCategory = createAdminSportsCategory(1);
      api.category.mockImplementation((id: string) => (id === firstCategory.id ? first : second));

      const firstSelection = workspace.selectCategory(firstCategory, { navigate: false });
      const secondSelection = workspace.selectCategory(secondCategory, { navigate: false });
      first.next(createAdminSportsCategoryRead(firstCategory));
      first.complete();
      await firstSelection;

      expect(workspace.loading()).toBe(true);
      second.next(createAdminSportsCategoryRead(secondCategory));
      second.complete();
      await secondSelection;
      expect(workspace.loading()).toBe(false);
    });

    it('ignores a duplicate save while another workspace mutation is in flight', async () => {
      const pending = new Subject<string>();
      api.mutate.mockReturnValue(pending);
      const tournament = createAdminSportsTournamentRead({ teamCount: 1 });
      workspace.tournamentRead.set(tournament);
      workspace.newTeam(false);
      workspace.teamForm.patchValue({ name: 'Equipe teste', institution: '', status: 'DRAFT' });
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      const firstSave = workspace.saveTeam();
      const secondSave = workspace.saveTeam();
      expect(api.mutate).toHaveBeenCalledTimes(1);

      pending.next('team-new');
      pending.complete();
      await Promise.all([firstSave, secondSave]);
      expect(api.mutate).toHaveBeenCalledTimes(1);
    });

    it('keeps one availability and seed draft per modality before saving registrations', async () => {
      const read = createAdminSportsTeamRead();
      workspace.teamRead.set(read);
      const existing = workspace.registrationOptions().find((option) => option.category.id === 'category-1');
      const newOption = workspace.registrationOptions().find((option) => option.category.id === 'category-2');
      expect(existing?.selected).toBe(true);
      expect(existing?.seed).toBe(1);
      expect(newOption?.selected).toBe(false);

      workspace.toggleRegistration('category-2', true);
      workspace.setRegistrationSeed('category-2', {
        target: { value: '6' },
      } as unknown as Event);
      expect(workspace.registrationOptions().find((option) => option.category.id === 'category-2')).toEqual(
        expect.objectContaining({ selected: true, seed: 6 }),
      );

      api.mutate.mockReturnValue(of('registration-new'));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();

      await workspace.saveRegistrationSelections();

      expect(api.mutate).toHaveBeenCalledWith('createSportsRegistration', 'SportsRegistrationCreateInput', {
        teamId: read.team.id,
        categoryId: 'category-2',
        seed: 6,
        formAnswersJson: null,
      });
    });

    it('updates and deletes registrations with their optimistic revisions', async () => {
      const read = createAdminSportsCategoryRead();
      const registration = read.registrations[0];
      workspace.categoryRead.set(read);
      vi.spyOn(workspace, 'selectCategory').mockResolvedValue();

      await workspace.setRegistrationStatus(registration, 'REJECTED');
      expect(api.mutate).toHaveBeenCalledWith('updateSportsRegistration', 'SportsRegistrationUpdateInput', {
        id: registration.id,
        expectedRevision: registration.revision,
        status: 'REJECTED',
      });

      await workspace.deleteRegistration(registration);
      expect(api.deleteVersioned).toHaveBeenCalledWith(
        'deleteSportsRegistration',
        registration.id,
        registration.revision,
      );
    });
  });

  describe('matches and venues', () => {
    it('publishes a draft match and refreshes its public-site publication state', async () => {
      const review = createAdminSportsMatchReview();
      review.match.event = {
        ...review.match.event!,
        isPubliclyListed: false,
        publicationState: 'DRAFT',
      };
      workspace.matchReview.set(review);
      api.matchReview.mockReturnValue(of(review));
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.publishSelectedMatch();

      expect(api.mutate).toHaveBeenCalledWith('publishSportsMatch', 'SportsMatchPublicationInput', {
        id: review.match.id,
      });
      expect(workspace.selectMatch).toHaveBeenCalledWith(review.match, { navigate: false });
      expect(snackbar.open).toHaveBeenCalledWith(
        'Partida publicada no site e disponível para o OBS.',
        'Fechar',
        expect.objectContaining({ duration: 3000 }),
      );
    });

    it('confirms before removing a public match from the site', async () => {
      const review = createAdminSportsMatchReview();
      workspace.matchReview.set(review);
      api.matchReview.mockReturnValue(of(review));
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.unpublishSelectedMatch();

      expect(api.mutate).toHaveBeenCalledWith('unpublishSportsMatch', 'SportsMatchPublicationInput', {
        id: review.match.id,
      });
    });

    it('loads both registration reads and initializes lineup selections', async () => {
      const review = createAdminSportsMatchReview();
      api.matchReview.mockReturnValue(of(review));
      api.registration.mockImplementation((id: 'registration-home' | 'registration-away') =>
        of(createAdminSportsRegistrationRead(id)),
      );

      await workspace.selectMatch(review.match);

      expect(api.registration).toHaveBeenCalledTimes(2);
      expect(workspace.lineupSelections()['registration-home']).toHaveLength(5);
      expect(workspace.selectedMatchId()).toBe(review.match.id);
    });

    it('uses team-backed lineup candidates when a registration has no member links', async () => {
      const review = createAdminSportsMatchReview();
      const registration = createAdminSportsRegistrationRead('registration-home');
      registration.members = [];
      registration.lineupMembers = [
        {
          id: 'team-member-unassigned',
          registrationMemberId: null,
          teamMemberId: 'team-member-unassigned',
          role: 'PLAYER',
          eligibility: 'ELIGIBLE',
          person: { id: 'person-unassigned', name: 'Ana Souza' },
        },
      ];
      api.matchReview.mockReturnValue(of(review));
      api.registration.mockImplementation((id: string) =>
        of(id === 'registration-home' ? registration : createAdminSportsRegistrationRead('registration-away')),
      );

      await workspace.selectMatch(review.match);

      expect(workspace.lineupSelections()['registration-home']).toEqual(['team-member-unassigned']);
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();
      await workspace.saveLineup('registration-home');

      expect(api.mutate).toHaveBeenCalledWith(
        'upsertAdminSportsMatchRoster',
        'SportsMatchRosterUpsertInput',
        expect.objectContaining({
          entries: [
            expect.objectContaining({
              registrationMemberId: 'team-member-unassigned',
              teamMemberId: 'team-member-unassigned',
            }),
          ],
        }),
      );
    });

    it('does not let stale registration reads repopulate a new match draft', async () => {
      const review = createAdminSportsMatchReview();
      const match = new Subject<ReturnType<typeof createAdminSportsMatchReview>>();
      const home = new Subject<ReturnType<typeof createAdminSportsRegistrationRead>>();
      const away = new Subject<ReturnType<typeof createAdminSportsRegistrationRead>>();
      api.matchReview.mockReturnValue(match);
      api.registration.mockImplementation((id: string) => (id === 'registration-home' ? home : away));

      const selection = workspace.selectMatch(review.match, { navigate: false });
      match.next(review);
      match.complete();
      await Promise.resolve();
      workspace.newMatch(false);
      home.next(createAdminSportsRegistrationRead('registration-home'));
      home.complete();
      away.next(createAdminSportsRegistrationRead('registration-away'));
      away.complete();
      await selection;

      expect(workspace.registrationReads()).toEqual({});
      expect(workspace.lineupSelections()).toEqual({});
    });

    it('persists only selected lineup members with trimmed shirt numbers', async () => {
      const review = createAdminSportsMatchReview();
      const registration = createAdminSportsRegistrationRead('registration-home');
      workspace.matchReview.set(review);
      workspace.registrationReads.set({ [registration.registration.id]: registration });
      workspace.lineupSelections.set({ [registration.registration.id]: [registration.members[0].id] });
      workspace.updateLineupDetail(registration.registration.id, registration.members[0].id, 'shirtNumber', ' 10 ');
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.saveLineup(registration.registration.id);

      expect(api.mutate).toHaveBeenCalledWith(
        'upsertAdminSportsMatchRoster',
        'SportsMatchRosterUpsertInput',
        expect.objectContaining({
          matchId: review.match.id,
          entries: [expect.objectContaining({ registrationMemberId: registration.members[0].id, shirtNumber: '10' })],
        }),
      );
    });

    it('generates a seeded bracket for all category registrations', async () => {
      const read = createAdminSportsCategoryRead();
      workspace.categoryRead.set(read);
      workspace.bracketForm.patchValue({
        randomizeUnseeded: true,
        randomSeed: 'fixture-seed',
        replaceExistingDraft: true,
      });
      vi.spyOn(workspace, 'selectCategory').mockResolvedValue();

      await workspace.generateBracket();

      expect(api.mutate).toHaveBeenCalledWith('generateSportsBracket', 'SportsBracketGenerateInput', {
        categoryId: read.category.id,
        participants: read.registrations.map((registration) => ({
          registrationId: registration.id,
          seed: registration.seed,
        })),
        randomizeUnseeded: true,
        randomSeed: 'fixture-seed',
        replaceExistingDraft: true,
      });
    });

    it('creates a venue with nullable optional values', async () => {
      const tournament = createAdminSportsTournamentRead();
      workspace.tournamentRead.set(tournament);
      workspace.newVenue();
      workspace.venueForm.patchValue({ placePresetId: 'place-2', name: 'Quadra auxiliar' });
      api.mutate.mockReturnValue(of('venue-new'));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.saveVenue();

      expect(api.mutate).toHaveBeenCalledWith('createSportsVenue', 'SportsVenueCreateInput', {
        tournamentId: tournament.tournament.id,
        placePresetId: 'place-2',
        name: 'Quadra auxiliar',
        courtLabel: null,
        capacity: null,
        notes: null,
        parentVenueId: null,
      });
    });

    it('updates an existing venue and preserves tournament concurrency context', async () => {
      const tournament = createAdminSportsTournamentRead();
      const venue = tournament.venues[0];
      workspace.tournamentRead.set(tournament);
      workspace.selectVenue(venue);
      workspace.venueForm.patchValue({ courtLabel: 'Quadra renovada', capacity: 600 });
      api.mutate.mockReturnValue(of(venue.id));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.saveVenue();

      expect(api.mutate).toHaveBeenCalledWith(
        'updateSportsVenue',
        'SportsVenueUpdateInput',
        expect.objectContaining({
          id: venue.id,
          tournamentId: tournament.tournament.id,
          expectedRevision: venue.revision,
          courtLabel: 'Quadra renovada',
          capacity: 600,
        }),
      );
    });

    it('deletes a venue using tournament context and clears its form', async () => {
      const tournament = createAdminSportsTournamentRead();
      const venue = tournament.venues[0];
      workspace.tournamentRead.set(tournament);
      workspace.selectedVenueId.set(venue.id);
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.deleteSelectedVenue();

      expect(api.deleteVersioned).toHaveBeenCalledWith(
        'deleteSportsVenue',
        venue.id,
        venue.revision,
        tournament.tournament.id,
      );
      expect(workspace.selectedVenueId()).toBe('');
    });

    it('assigns a match-scoped official and resets the assignment form', async () => {
      const review = createAdminSportsMatchReview();
      workspace.matchReview.set(review);
      workspace.selectedMatchId.set(review.match.id);
      workspace.officialForm.patchValue({
        personId: 'person-official',
        personQuery: 'Oficial da partida',
        role: 'REFEREE',
        scope: 'MATCH',
      });
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.assignOfficial();

      expect(api.mutate).toHaveBeenCalledWith('assignSportsOfficial', 'SportsOfficialAssignInput', {
        tournamentId: 'tournament-1',
        categoryId: null,
        matchId: review.match.id,
        personId: 'person-official',
        role: 'REFEREE',
      });
      expect(workspace.officialForm.controls.personId.value).toBe('');
    });

    it('edits an existing official function through the versioned update mutation', async () => {
      const review = createAdminSportsMatchReview();
      const official = {
        ...createAdminSportsTournamentRead().officials[0],
        id: 'match-official-1',
        categoryId: null,
        matchId: review.match.id,
        role: 'REFEREE' as const,
        revision: 4,
      };
      review.officials = [official];
      workspace.matchReview.set(review);
      workspace.editOfficial(official);
      workspace.officialForm.controls.role.setValue('SCOREKEEPER');
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.assignOfficial();

      expect(api.mutate).toHaveBeenCalledWith('updateSportsOfficial', 'SportsOfficialUpdateInput', {
        id: 'match-official-1',
        expectedRevision: 4,
        role: 'SCOREKEEPER',
      });
      expect(workspace.isEditingOfficial()).toBe(false);
      expect(workspace.officialForm.controls.personId.value).toBe('');
    });

    it('removes an official through the permissioned versioned delete mutation', async () => {
      const review = createAdminSportsMatchReview();
      const official = {
        ...createAdminSportsTournamentRead().officials[0],
        id: 'match-official-1',
        categoryId: null,
        matchId: review.match.id,
      };
      review.officials = [official];
      workspace.matchReview.set(review);
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.removeOfficial(official);

      expect(api.deleteVersioned).toHaveBeenCalledWith('deleteSportsOfficial', 'match-official-1', official.revision);
      expect(snackbar.open).toHaveBeenCalledWith(
        'Pessoa removida da equipe de arbitragem.',
        'Fechar',
        expect.objectContaining({ duration: 3000 }),
      );
    });

    it('creates a manual tournament score entry and resets its controls', async () => {
      workspace.scoreEntryForm.patchValue({ teamId: 'team-1', source: 'MANUAL', points: 3, reason: 'Fair play' });
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.createScoreEntry();

      expect(api.mutate).toHaveBeenCalledWith('createSportsTournamentScoreEntry', 'SportsTournamentScoreEntryInput', {
        tournamentId: 'tournament-1',
        teamId: 'team-1',
        source: 'MANUAL',
        points: 3,
        reason: 'Fair play',
      });
      expect(workspace.scoreEntryForm.controls.points.value).toBe(0);
    });
  });

  describe('reviews', () => {
    it('leaves the review untouched when a non-approved application review is canceled', async () => {
      const application = createAdminSportsApplications(1)[0];
      dialog.open.mockReturnValue({ afterClosed: () => of(null) });

      await workspace.reviewApplication(application, 'REJECTED');

      expect(api.reviewApplication).not.toHaveBeenCalled();
      expect(workspace.loading()).toBe(false);
    });

    it('reviews an application with an operator message and reloads the queue', async () => {
      const application = createAdminSportsApplications(1)[0];
      dialog.open.mockReturnValue({ afterClosed: () => of('Documentação incompleta') });
      api.reviewApplication.mockReturnValue(of(application.id));
      api.applicationQueue.mockReturnValue(of([]));

      await workspace.reviewApplication(application, 'CHANGES_REQUESTED');

      expect(api.reviewApplication).toHaveBeenCalledWith({
        applicationId: application.id,
        decision: 'CHANGES_REQUESTED',
        reviewMessage: 'Documentação incompleta',
      });
      expect(workspace.applications()).toEqual([]);
    });

    it('opens the reviewed action through its category and match fixtures', async () => {
      const item = createAdminSportsPendingMatchActions()[0];
      workspace.tournamentRead.set(createAdminSportsTournamentRead());
      const categoryRead = createAdminSportsCategoryRead();
      const selectCategory = vi.spyOn(workspace, 'selectCategory').mockImplementation(async (category) => {
        workspace.categoryRead.set({ ...categoryRead, category });
      });
      const selectMatch = vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.openMatchFromReview(item);

      expect(workspace.activeArea()).toBe('matches');
      expect(selectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: item.match.categoryId }));
      expect(selectMatch).toHaveBeenCalledWith(expect.objectContaining({ id: item.match.id }));
    });

    it('reviews a team change with its request revision and refreshes both views', async () => {
      const read = createAdminSportsTeamRead();
      const request = read.changeRequests[0];
      workspace.teamRead.set(read);
      api.reviewTeamChange.mockReturnValue(of(request.id));
      vi.spyOn(workspace, 'selectTeam').mockResolvedValue();
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.reviewTeamChange(request, 'APPROVED');

      expect(api.reviewTeamChange).toHaveBeenCalledWith({
        requestId: request.id,
        expectedRequestRevision: request.requestRevision,
        decision: 'APPROVED',
        reviewMessage: null,
      });
      expect(workspace.selectTeam).toHaveBeenCalledWith(read.team);
      expect(workspace.loadTournament).toHaveBeenCalled();
    });

    it('does not submit a rejected action when the reviewer cancels its message', async () => {
      const item = createAdminSportsPendingMatchActions()[0];
      workspace.pendingMatchActions.set([item]);
      dialog.open.mockReturnValue({ afterClosed: () => of(null) });

      await workspace.reviewAction(item.action.id, 'REJECTED');

      expect(api.reviewMatchAction).not.toHaveBeenCalled();
    });

    it('refreshes the selected match after approving its queued action', async () => {
      const item = createAdminSportsPendingMatchActions()[0];
      const review = createAdminSportsMatchReview();
      workspace.pendingMatchActions.set([item]);
      workspace.matchReview.set(review);
      api.reviewMatchAction.mockReturnValue(of(item.action.id));
      api.matchActionReviewQueue.mockReturnValue(of([]));
      vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.reviewAction(item.action.id, 'APPROVED');

      expect(api.reviewMatchAction).toHaveBeenCalledWith({
        actionId: item.action.id,
        decision: 'APPROVED',
        reviewMessage: null,
      });
      expect(workspace.selectMatch).toHaveBeenCalledWith(review.match);
      expect(workspace.pendingMatchActions()).toEqual([]);
    });

    it('surfaces API review failures and always releases global loading', async () => {
      const application = createAdminSportsApplications(1)[0];
      api.reviewApplication.mockReturnValue(throwError(() => new Error('Review service unavailable')));

      await workspace.reviewApplication(application, 'APPROVED');

      expect(workspace.error()).toBe('Review service unavailable');
      expect(workspace.loading()).toBe(false);
      expect(snackbar.open).toHaveBeenCalledWith(
        'Review service unavailable',
        'Fechar',
        expect.objectContaining({ duration: 6000, panelClass: ['snackbar-error'] }),
      );
    });

    it('stops review navigation when its category is absent or fails to load', async () => {
      const item = createAdminSportsPendingMatchActions()[0];
      workspace.tournamentRead.set(createAdminSportsTournamentRead({ categoryCount: 0 }));
      const selectCategory = vi.spyOn(workspace, 'selectCategory').mockResolvedValue();
      const selectMatch = vi.spyOn(workspace, 'selectMatch').mockResolvedValue();

      await workspace.openMatchFromReview(item);
      expect(selectCategory).not.toHaveBeenCalled();

      workspace.tournamentRead.set(createAdminSportsTournamentRead({ categoryCount: 1 }));
      selectCategory.mockImplementation(async () => workspace.categoryRead.set(null));
      await workspace.openMatchFromReview(item);
      expect(selectCategory).toHaveBeenCalled();
      expect(selectMatch).not.toHaveBeenCalled();
    });

    it('clones selected tournament parts into another major event and opens the result', async () => {
      const source = createAdminMajorEvent({ id: 'major-games-2026', name: 'Jogos de origem' });
      const destination = createAdminMajorEvent({ id: 'major-destination', name: 'Jogos de destino' });
      workspace.majorEvents.set([source, destination]);
      const parts = {
        categories: true,
        teams: true,
        registrations: false,
        venues: true,
        officials: false,
        rules: true,
      };
      dialog.open.mockReturnValue({
        afterClosed: () => of({ destinationMajorEventId: destination.id, parts }),
      });
      api.mutate.mockReturnValue(of('tournament-clone'));
      api.tournaments.mockReturnValue(of([]));
      vi.spyOn(workspace, 'loadTournament').mockResolvedValue();

      await workspace.cloneTournament();

      expect(api.mutate).toHaveBeenCalledWith('cloneSportsTournament', 'SportsTournamentCloneInput', {
        sourceTournamentId: 'tournament-1',
        destinationMajorEventId: destination.id,
        parts,
      });
      expect(workspace.loadTournament).toHaveBeenCalledWith('tournament-clone');
      expect(api.tournaments).toHaveBeenCalledWith({ take: 100 });
    });

    it('cancels tournament cloning without calling the API', async () => {
      dialog.open.mockReturnValue({ afterClosed: () => of(null) });

      await workspace.cloneTournament();

      expect(api.mutate).not.toHaveBeenCalled();
    });

    it('applies live review snapshots for every selected workspace entity', async () => {
      const events = new Subject<void>();
      const tournament = createAdminSportsTournamentRead();
      const category = createAdminSportsCategoryRead();
      const team = createAdminSportsTeamRead();
      const match = createAdminSportsMatchReview();
      const applications = createAdminSportsApplications(2);
      const actions = createAdminSportsPendingMatchActions(2);
      workspace.tournamentRead.set(tournament);
      workspace.selectedCategoryId.set(category.category.id);
      workspace.selectedTeamId.set(team.team.id);
      workspace.selectedMatchId.set(match.match.id);
      api.watchTournamentReview.mockReturnValue(events);
      api.tournament.mockReturnValue(of(tournament));
      api.applicationQueue.mockReturnValue(of(applications));
      api.matchActionReviewQueue.mockReturnValue(of(actions));
      api.category.mockReturnValue(of(category));
      api.team.mockReturnValue(of(team));
      api.matchReview.mockReturnValue(of(match));

      const callable = workspace as unknown as { watchTournament(tournamentId: string): void };
      callable.watchTournament(tournament.tournament.id);
      events.next();

      await vi.waitFor(() => expect(workspace.matchReview()).toEqual(match));
      expect(workspace.categoryRead()).toEqual(category);
      expect(workspace.teamRead()).toEqual(team);
      expect(workspace.applications()).toEqual(applications);
      expect(workspace.pendingMatchActions()).toEqual(actions);
    });

    it('keeps the workspace lists current when a selected detail cannot refresh', async () => {
      const events = new Subject<void>();
      const current = createAdminSportsTournamentRead();
      const updated = {
        ...current,
        teams: [...current.teams, { ...current.teams[0], id: 'team-new', name: 'Equipe nova' }],
      };
      workspace.tournamentRead.set(current);
      workspace.teamRead.set(createAdminSportsTeamRead());
      workspace.selectedTeamId.set('team-1');
      api.watchTournamentReview.mockReturnValue(events);
      api.tournament.mockReturnValue(of(updated));
      api.applicationQueue.mockReturnValue(of([]));
      api.matchActionReviewQueue.mockReturnValue(of([]));
      api.team.mockReturnValue(throwError(() => new Error('Equipe selecionada indisponível')));

      const callable = workspace as unknown as { watchTournament(tournamentId: string): void };
      callable.watchTournament(current.tournament.id);
      events.next();

      await vi.waitFor(() => expect(workspace.tournamentRead()).toEqual(updated));
      expect(workspace.error()).toBe('Equipe selecionada indisponível');
    });

    it('records live refresh failures without replacing the current snapshot', async () => {
      const events = new Subject<void>();
      const current = createAdminSportsTournamentRead();
      workspace.tournamentRead.set(current);
      api.watchTournamentReview.mockReturnValue(events);
      api.tournament.mockReturnValue(throwError(() => new Error('Realtime refresh unavailable')));
      api.applicationQueue.mockReturnValue(of([]));
      api.matchActionReviewQueue.mockReturnValue(of([]));

      const callable = workspace as unknown as { watchTournament(tournamentId: string): void };
      callable.watchTournament(current.tournament.id);
      events.next();

      await vi.waitFor(() => expect(workspace.error()).toBe('Realtime refresh unavailable'));
      expect(workspace.tournamentRead()).toEqual(current);
    });

    it('notifies when the live review stream disconnects', () => {
      api.watchTournamentReview.mockReturnValue(throwError(() => new Error('stream disconnected')));
      const callable = workspace as unknown as { watchTournament(tournamentId: string): void };

      callable.watchTournament('tournament-1');

      expect(snackbar.open).toHaveBeenCalledWith(
        'As atualizações ao vivo foram interrompidas. Reabra o torneio para reconectar.',
        'Fechar',
        expect.objectContaining({ duration: 6000 }),
      );
    });
  });
});
