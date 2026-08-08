import { firstValueFrom } from 'rxjs';
import type { SportsMatchSummary, SportsVenueSummary } from './sports.models';
import { toIsoDateOrUndefined, toLocalDate } from './sports-workspace-form.utils';
import { SportsWorkspaceTeamService } from './sports-workspace-team.service';

export abstract class SportsWorkspaceMatchService extends SportsWorkspaceTeamService {
  async selectMatch(match: SportsMatchSummary): Promise<void> {
    await this.run('Não foi possível carregar a partida.', async () => {
      const read = await firstValueFrom(this.api.matchReview(match.id));
      this.matchReview.set(read);
      this.selectedMatchId.set(match.id);
      this.matchForm.patchValue({
        id: match.id,
        categoryId: match.categoryId,
        name: match.event?.name ?? 'Partida',
        startDate: toLocalDate(match.event?.startDate),
        endDate: toLocalDate(match.event?.endDate),
        stageId: match.stageId ?? '',
        venueId: match.venueId ?? '',
        homeRegistrationId: match.homeRegistrationId ?? '',
        awayRegistrationId: match.awayRegistrationId ?? '',
        roundNumber: match.roundNumber ?? 1,
        bracketPosition: match.bracketPosition ?? 1,
        groupKey: match.groupKey ?? '',
        state: match.state,
        notes: match.notes ?? '',
        livestreamProvider: match.livestreamProvider ?? '',
        livestreamUrl: match.livestreamUrl ?? '',
      });
      await this.loadMatchRegistrations(read);
    });
  }

  isLineupSelected(registrationId: string, registrationMemberId: string): boolean {
    return this.lineupSelections()[registrationId]?.includes(registrationMemberId) ?? false;
  }

  toggleLineup(registrationId: string, registrationMemberId: string, selected: boolean): void {
    this.lineupSelections.update((current) => {
      const values = new Set(current[registrationId] ?? []);
      if (selected) {
        values.add(registrationMemberId);
      } else {
        values.delete(registrationMemberId);
      }
      return { ...current, [registrationId]: [...values] };
    });
  }

  lineupRole(registrationId: string, registrationMemberId: string, fallback: string): string {
    return this.lineupDetails()[registrationId]?.[registrationMemberId]?.role ?? fallback;
  }

  lineupShirtNumber(registrationId: string, registrationMemberId: string): string {
    return this.lineupDetails()[registrationId]?.[registrationMemberId]?.shirtNumber ?? '';
  }

  updateLineupDetail(
    registrationId: string,
    registrationMemberId: string,
    field: 'role' | 'shirtNumber',
    value: string,
    fallbackRole: string,
  ): void {
    this.lineupDetails.update((current) => ({
      ...current,
      [registrationId]: {
        ...(current[registrationId] ?? {}),
        [registrationMemberId]: {
          role: current[registrationId]?.[registrationMemberId]?.role ?? fallbackRole,
          shirtNumber: current[registrationId]?.[registrationMemberId]?.shirtNumber ?? '',
          [field]: value,
        },
      },
    }));
  }

  async saveLineup(registrationId: string): Promise<void> {
    const match = this.matchReview()?.match;
    const registration = this.registrationReads()[registrationId];
    if (!match || !registration) {
      return;
    }
    const existing = this.matchReview()?.rosters.find((roster) => roster.registrationId === registrationId);
    const selected = new Set(this.lineupSelections()[registrationId] ?? []);
    await this.run('Não foi possível salvar a escalação.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('upsertAdminSportsMatchRoster', 'SportsMatchRosterUpsertInput', {
          matchId: match.id,
          registrationId,
          expectedRevision: existing?.revision,
          status: 'APPROVED',
          entries: registration.members
            .filter((member) => selected.has(member.id))
            .map((member) => ({
              registrationMemberId: member.id,
              role: this.lineupRole(registrationId, member.id, member.role),
              shirtNumber: this.lineupShirtNumber(registrationId, member.id).trim() || null,
              status: 'APPROVED',
            })),
        }),
      );
      await this.selectMatch(match);
      this.notify('Escalação da partida salva.');
    });
  }

  async saveMatch(): Promise<void> {
    if (this.matchForm.invalid) {
      this.matchForm.markAllAsTouched();
      return;
    }
    const raw = this.matchForm.getRawValue();
    const existing = this.matchReview()?.match;
    await this.run('Não foi possível salvar a partida.', async () => {
      const payload = existing
        ? {
            id: existing.id,
            expectedRevision: existing.revision,
            startDate: toIsoDateOrUndefined(raw.startDate),
            endDate: toIsoDateOrUndefined(raw.endDate),
            stageId: raw.stageId || null,
            venueId: raw.venueId || null,
            homeRegistrationId: raw.homeRegistrationId || null,
            awayRegistrationId: raw.awayRegistrationId || null,
            roundNumber: raw.roundNumber || null,
            bracketPosition: raw.bracketPosition || null,
            groupKey: raw.groupKey || null,
            state: raw.state,
            notes: raw.notes || null,
            livestreamProvider: raw.livestreamProvider || null,
            livestreamUrl: raw.livestreamUrl || null,
          }
        : {
            categoryId: raw.categoryId,
            name: raw.name,
            startDate: toIsoDateOrUndefined(raw.startDate),
            endDate: toIsoDateOrUndefined(raw.endDate),
            stageId: raw.stageId || null,
            venueId: raw.venueId || null,
            homeRegistrationId: raw.homeRegistrationId || null,
            awayRegistrationId: raw.awayRegistrationId || null,
            roundNumber: raw.roundNumber || null,
            bracketPosition: raw.bracketPosition || null,
            groupKey: raw.groupKey || null,
            notes: raw.notes || null,
            livestreamProvider: raw.livestreamProvider || null,
            livestreamUrl: raw.livestreamUrl || null,
          };
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsMatch' : 'createSportsMatch',
          existing ? 'SportsMatchUpdateInput' : 'SportsMatchCreateInput',
          payload,
        ),
      );
      const category = this.tournamentRead()?.categories.find((item) => item.id === raw.categoryId);
      if (category) {
        await this.selectCategory(category);
        const match = this.categoryRead()?.matches.find((item) => item.id === id);
        if (match) {
          await this.selectMatch(match);
        }
      }
      this.notify('Partida salva.');
    });
  }

  async deleteSelectedMatch(): Promise<void> {
    const match = this.matchReview()?.match;
    const category = this.categoryRead()?.category;
    if (
      !match ||
      !category ||
      !(await this.confirmAction('Excluir partida?', 'A partida e o evento de calendário associado serão removidos.'))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a partida.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsMatch', match.id, match.revision));
      this.newMatch();
      await this.selectCategory(category);
    });
  }

  async assignOfficial(): Promise<void> {
    if (this.officialForm.invalid || !this.tournamentId()) {
      return;
    }
    const raw = this.officialForm.getRawValue();
    await this.run('Não foi possível atribuir o oficial.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('assignSportsOfficial', 'SportsOfficialAssignInput', {
          tournamentId: this.tournamentId(),
          categoryId: raw.scope === 'CATEGORY' ? this.selectedCategoryId() || null : null,
          matchId: raw.scope === 'MATCH' ? this.selectedMatchId() || null : null,
          personId: raw.personId,
          role: raw.role,
        }),
      );
      const match = this.matchReview()?.match;
      if (match) {
        await this.selectMatch(match);
      }
      this.officialForm.reset({ personQuery: '', personId: '', role: 'REFEREE', scope: 'MATCH' });
      this.notify('Função esportiva atribuída.');
    });
  }

  async generateBracket(): Promise<void> {
    const category = this.categoryRead();
    if (!category || category.registrations.length < 2) {
      this.notify('A modalidade precisa de pelo menos duas inscrições.', true);
      return;
    }
    await this.run('Não foi possível gerar a chave.', async () => {
      const raw = this.bracketForm.getRawValue();
      await firstValueFrom(
        this.api.mutate<string[]>('generateSportsBracket', 'SportsBracketGenerateInput', {
          categoryId: category.category.id,
          participants: category.registrations.map((registration) => ({
            registrationId: registration.id,
            seed: registration.seed ?? null,
          })),
          randomizeUnseeded: raw.randomizeUnseeded,
          randomSeed: raw.randomSeed || null,
          replaceExistingDraft: raw.replaceExistingDraft,
        }),
      );
      await this.selectCategory(category.category);
      this.notify('Chave gerada. Revise confrontos e horários antes de publicar.');
    });
  }

  async createScoreEntry(): Promise<void> {
    if (this.scoreEntryForm.invalid || !this.tournamentId()) {
      return;
    }
    await this.run('Não foi possível registrar a pontuação.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('createSportsTournamentScoreEntry', 'SportsTournamentScoreEntryInput', {
          tournamentId: this.tournamentId(),
          ...this.scoreEntryForm.getRawValue(),
        }),
      );
      await this.loadTournament();
      this.scoreEntryForm.reset({ teamId: '', source: 'MANUAL', points: 0, reason: '' });
    });
  }

  newVenue(): void {
    this.selectedVenueId.set('');
    this.venueForm.reset({
      id: '',
      placePresetId: '',
      name: '',
      courtLabel: '',
      capacity: 0,
      notes: '',
      parentVenueId: '',
    });
  }

  selectVenue(venue: SportsVenueSummary): void {
    this.selectedVenueId.set(venue.id);
    this.venueForm.patchValue({
      id: venue.id,
      placePresetId: venue.placePresetId,
      name: venue.name,
      courtLabel: venue.courtLabel ?? '',
      capacity: venue.capacity ?? 0,
      notes: venue.notes ?? '',
      parentVenueId: venue.parentVenueId ?? '',
    });
    this.matchForm.controls.venueId.setValue(venue.id);
  }

  async saveVenue(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    if (!tournament || this.venueForm.invalid) {
      this.venueForm.markAllAsTouched();
      return;
    }
    const raw = this.venueForm.getRawValue();
    const existing = this.tournamentRead()?.venues.find((venue) => venue.id === raw.id);
    await this.run('Não foi possível salvar o local esportivo.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsVenue' : 'createSportsVenue',
          existing ? 'SportsVenueUpdateInput' : 'SportsVenueCreateInput',
          {
            ...(existing
              ? {
                  id: existing.id,
                  tournamentId: tournament.id,
                  expectedRevision: existing.revision,
                }
              : { tournamentId: tournament.id }),
            placePresetId: raw.placePresetId,
            name: raw.name,
            courtLabel: raw.courtLabel || null,
            capacity: raw.capacity || null,
            notes: raw.notes || null,
            parentVenueId: raw.parentVenueId || null,
          },
        ),
      );
      await this.loadTournament();
      const venue = this.tournamentRead()?.venues.find((item) => item.id === id);
      if (venue) {
        this.selectVenue(venue);
      }
      this.notify('Local esportivo salvo.');
    });
  }

  async deleteSelectedVenue(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    const venue = this.tournamentRead()?.venues.find((item) => item.id === this.selectedVenueId());
    if (
      !tournament ||
      !venue ||
      !(await this.confirmAction(`Excluir ${venue.name}?`, 'Partidas futuras precisarão receber outro local.'))
    ) {
      return;
    }
    await this.run('Não foi possível excluir o local esportivo.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsVenue', venue.id, venue.revision, tournament.id));
      this.newVenue();
      await this.loadTournament();
    });
  }
}
