import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsConfirmationDialog, SportsConfirmationDialogData } from './sports-confirmation-dialog';
import {
  RepresentativeTeamChange,
  RepresentativeTeamWorkspace,
  SportsLineupRead,
  SportsMatchAction,
} from './sports-operations.types';
import {
  createSportsOperationId,
  lineupMembersFromRead,
  normalizeShirtNumber,
  parseRepresentativeChangeDelta,
  readRepresentativeRecord,
  representativeChangeLabel,
  representativeChangeStatusLabel,
  representativeLineupRoleLabel,
  representativeMatchStateLabel,
  representativeMatchupLabel,
  representativeMemberStatusLabel,
  type LineupMember,
} from './team-operations-page.utils';
import { createTeamOperationsForms } from './team-operations-page.forms';

@Component({
  selector: 'app-sports-team-operations-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTabsModule,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    TwemojiComponent,
  ],
  templateUrl: './team-operations-page.html',
  styleUrl: './team-operations-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsTeamOperationsPage implements OnInit, OnDestroy {
  private readonly api = inject(SportsOperationsApiService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);

  readonly workspace = signal<RepresentativeTeamWorkspace | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly lineupMembers = signal<LineupMember[]>([]);
  readonly lineupLoading = signal(false);
  readonly lineupError = signal<string | null>(null);
  readonly matchRevision = signal(1);
  readonly logoFile = signal<File | null>(null);
  readonly logoPreviewUrl = signal<string | null>(null);
  readonly logoError = signal<string | null>(null);
  readonly selectedMatchId = signal('');
  readonly selectedMatch = computed(
    () => this.workspace()?.matches.find((match) => match.id === this.selectedMatchId()) ?? null,
  );
  readonly lineupReadOnly = computed(() => {
    const state = this.selectedMatch()?.state;
    return state != null && state !== 'SCHEDULED' && state !== 'CHECK_IN';
  });

  private readonly forms = createTeamOperationsForms();
  readonly profileForm = this.forms.profile;
  readonly identityForm = this.forms.identity;
  readonly lineupForm = this.forms.lineup;

  private teamId = '';
  protected profileRequest: RepresentativeTeamChange | null = null;

  ngOnInit(): void {
    this.teamId = this.route.snapshot.paramMap.get('teamId') ?? '';
    this.lineupForm.patchValue({
      matchId: this.route.snapshot.queryParamMap.get('matchId') ?? '',
      registrationId: this.route.snapshot.queryParamMap.get('registrationId') ?? '',
    });
    this.load();
  }

  ngOnDestroy(): void {
    this.revokeLogoPreview();
  }

  loadLineup(): void {
    const { matchId, registrationId } = this.lineupForm.getRawValue();
    if (!matchId || !registrationId) {
      return;
    }
    this.lineupLoading.set(true);
    this.api.lineup(matchId, registrationId).subscribe({
      next: (lineup) => {
        this.applyLineup(lineup);
        this.lineupLoading.set(false);
        this.lineupError.set(null);
      },
      error: (error: unknown) => {
        this.lineupLoading.set(false);
        this.lineupError.set(error instanceof Error ? error.message : 'Não foi possível carregar a escalação.');
      },
    });
  }

  load(): void {
    this.loading.set(true);
    this.api.representativeWorkspace(this.teamId).subscribe({
      next: (workspace) => {
        this.workspace.set(workspace);
        this.profileRequest =
          [...workspace.queuedChanges]
            .reverse()
            .find(
              (change) =>
                change.type === 'TEAM_DETAILS' && ['PENDING', 'CHANGES_REQUESTED', 'CONFLICT'].includes(change.status),
            ) ?? null;
        const queuedDelta = this.parseDelta(this.profileRequest?.deltaJson);
        const queuedSet = this.readRecord(queuedDelta['set']);
        this.profileForm.setValue({
          name: typeof queuedSet['name'] === 'string' ? queuedSet['name'] : workspace.team.name,
          institution:
            typeof queuedSet['institution'] === 'string'
              ? queuedSet['institution']
              : (workspace.team.institution ?? ''),
        });
        this.selectInitialMatch(workspace);
        this.loading.set(false);
        this.error.set(null);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Não foi possível abrir a equipe.');
      },
    });
  }

  selectMatch(matchId: string): void {
    const workspace = this.workspace();
    const match = workspace?.matches.find((candidate) => candidate.id === matchId);
    if (!workspace || !match) {
      this.selectedMatchId.set('');
      this.lineupForm.reset({ matchId: '', registrationId: '', expectedRevision: null });
      this.lineupMembers.set([]);
      return;
    }
    this.selectedMatchId.set(matchId);
    const registrationIds = new Set(workspace.registrations.map((registration) => registration.id));
    const registrationId =
      [match.homeRegistrationId, match.awayRegistrationId].find((candidate): candidate is string =>
        Boolean(candidate && registrationIds.has(candidate)),
      ) ?? '';
    this.lineupForm.patchValue({ matchId, registrationId, expectedRevision: null });
    this.lineupMembers.set([]);
    this.loadLineup();
  }

  matchLabel(match: RepresentativeTeamWorkspace['matches'][number]): string {
    const registration = this.workspace()?.registrations.find(
      (candidate) => candidate.id === match.homeRegistrationId || candidate.id === match.awayRegistrationId,
    );
    return registration?.categoryName ?? 'Modalidade';
  }

  matchupLabel(match: RepresentativeTeamWorkspace['matches'][number]): string {
    return representativeMatchupLabel(match);
  }

  matchEmoji(match: RepresentativeTeamWorkspace['matches'][number]): string {
    return (
      this.workspace()?.registrations.find(
        (candidate) => candidate.id === match.homeRegistrationId || candidate.id === match.awayRegistrationId,
      )?.categoryEmoji ?? ''
    );
  }

  matchStateLabel(state: RepresentativeTeamWorkspace['matches'][number]['state']): string {
    return representativeMatchStateLabel(state);
  }

  memberStatusLabel(status: RepresentativeTeamWorkspace['members'][number]['status']): string {
    return representativeMemberStatusLabel(status);
  }

  async reviewJoinRequest(applicationId: string, applicantName: string, approved: boolean): Promise<void> {
    if (this.busy()) {
      return;
    }
    const confirmed = await firstValueFrom(
      this.dialog
        .open<SportsConfirmationDialog, SportsConfirmationDialogData, boolean>(SportsConfirmationDialog, {
          data: {
            title: approved ? `Aprovar entrada de ${applicantName}?` : `Recusar entrada de ${applicantName}?`,
            message: approved
              ? 'A pessoa entrará diretamente na equipe, pois a inscrição já passou pela análise administrativa.'
              : 'A solicitação será encerrada e não aparecerá mais nesta fila.',
            confirmLabel: approved ? 'Sim, aprovar' : 'Sim, recusar',
            destructive: !approved,
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.reviewTeamApplication({
          applicationId,
          teamId: this.teamId,
          approved,
        }),
      );
      this.snackbar.open(approved ? 'Pessoa adicionada à equipe.' : 'Solicitação recusada.', 'Fechar', {
        duration: 4000,
      });
      this.load();
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async saveProfile(): Promise<void> {
    const workspace = this.workspace();
    if (!workspace || this.profileForm.invalid || this.busy()) {
      return;
    }
    const currentQueued = this.parseDelta(this.profileRequest?.deltaJson);
    const value = this.profileForm.getRawValue();
    const delta = {
      ...currentQueued,
      set: {
        ...this.readRecord(currentQueued['set']),
        name: value.name.trim(),
        institution: value.institution.trim() || null,
      },
    };
    await this.submitChange({
      type: 'TEAM_DETAILS',
      delta,
      expectedRequestRevision: this.profileRequest?.requestRevision,
      pendingKey: this.profileRequest?.id ?? this.uuid(),
    });
  }

  async addMember(): Promise<void> {
    const workspace = this.workspace();
    if (!workspace || this.identityForm.invalid || this.busy()) {
      return;
    }
    const identity = this.identityForm.getRawValue();
    await this.submitChange({
      type: 'MEMBER_ADD',
      delta: {},
      pendingKey: this.uuid(),
      identityClaims: [{ clientKey: this.uuid(), type: identity.type, value: identity.value.trim() }],
    });
    this.identityForm.controls.value.reset();
  }

  selectLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.revokeLogoPreview();
    this.logoFile.set(null);
    this.logoError.set(null);
    if (!file) {
      return;
    }
    const allowedTypes = new Set(['image/avif', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      this.logoError.set('Use AVIF, SVG, PNG, JPEG ou WebP.');
      input.value = '';
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.logoError.set('O arquivo deve ter no máximo 15 MiB.');
      input.value = '';
      return;
    }
    this.logoFile.set(file);
    if (file.type !== 'image/svg+xml') {
      this.logoPreviewUrl.set(URL.createObjectURL(file));
    }
  }

  async uploadLogo(): Promise<void> {
    const workspace = this.workspace();
    const file = this.logoFile();
    if (!workspace || !file || this.busy()) {
      return;
    }
    const queuedLogo = [...workspace.queuedChanges]
      .reverse()
      .find((change) => change.type === 'LOGO' && ['PENDING', 'CHANGES_REQUESTED', 'CONFLICT'].includes(change.status));
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.uploadTeamLogo(workspace.team.id, workspace.teamRevision, file, queuedLogo?.requestRevision),
      );
      this.snackbar.open('Escudo enviado para aprovação.', 'Fechar', { duration: 4000 });
      this.logoFile.set(null);
      this.revokeLogoPreview();
      this.load();
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  toggleLineup(member: LineupMember, selected: boolean): void {
    this.lineupMembers.update((members) =>
      members.map((candidate) =>
        candidate.registrationMemberId === member.registrationMemberId ? { ...candidate, selected } : candidate,
      ),
    );
  }

  setLineupRole(member: LineupMember, role: LineupMember['role']): void {
    this.lineupMembers.update((members) =>
      members.map((candidate) =>
        candidate.registrationMemberId === member.registrationMemberId ? { ...candidate, role } : candidate,
      ),
    );
  }

  setShirtNumber(member: LineupMember, value: string): void {
    this.lineupMembers.update((members) =>
      members.map((candidate) =>
        candidate.registrationMemberId === member.registrationMemberId
          ? { ...candidate, shirtNumber: this.readShirtNumber(value) }
          : candidate,
      ),
    );
  }

  roleLabel(role: LineupMember['role']): string {
    return representativeLineupRoleLabel(role);
  }

  async saveLineup(): Promise<void> {
    if (this.lineupForm.invalid || this.busy() || this.lineupReadOnly()) {
      return;
    }
    const value = this.lineupForm.getRawValue();
    const entries = this.lineupMembers()
      .filter((member) => member.selected)
      .map((member) => ({
        registrationMemberId: member.registrationMemberId,
        role: member.role,
        shirtNumber: member.shirtNumber,
      }));
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.submitRoster({
          matchId: value.matchId,
          registrationId: value.registrationId,
          expectedRevision: value.expectedRevision ?? undefined,
          entries,
        }),
      );
      this.snackbar.open('Escalação enviada para aprovação.', 'Fechar', { duration: 4000 });
      this.loadLineup();
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  async forfeit(): Promise<void> {
    const value = this.lineupForm.getRawValue();
    if (!value.matchId || !value.registrationId || this.busy()) {
      return;
    }
    const confirmed = await firstValueFrom(
      this.dialog
        .open<SportsConfirmationDialog, SportsConfirmationDialogData, boolean>(SportsConfirmationDialog, {
          data: {
            title: 'Desistir desta partida?',
            message: 'A partida será encerrada e a desistência seguirá para revisão administrativa.',
            confirmLabel: 'Sim, desistir',
            destructive: true,
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    const action: SportsMatchAction = {
      clientId: this.uuid(),
      matchId: value.matchId,
      baseRevision: this.matchRevision(),
      type: 'FORFEIT',
      payloadJson: JSON.stringify({ loserRegistrationId: value.registrationId, lossReason: 'FORFEIT' }),
      authoredAt: new Date().toISOString(),
      offline: false,
    };
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.forfeit(action));
      this.snackbar.open('Desistência enviada para revisão.', 'Fechar', { duration: 5000 });
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  changeLabel(change: RepresentativeTeamChange): string {
    return representativeChangeLabel(change.type);
  }

  statusLabel(status: RepresentativeTeamChange['status']): string {
    return representativeChangeStatusLabel(status);
  }

  private async submitChange(input: {
    type: RepresentativeTeamChange['type'];
    delta: Record<string, unknown>;
    expectedRequestRevision?: number;
    pendingKey: string;
    identityClaims?: { clientKey: string; type: string; value: string }[];
  }): Promise<void> {
    const workspace = this.workspace();
    if (!workspace) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.api.submitTeamChange({
          teamId: workspace.team.id,
          type: input.type,
          baseRevision: workspace.teamRevision,
          expectedRequestRevision: input.expectedRequestRevision,
          baseFieldRevisionsJson: JSON.stringify({}),
          deltaJson: JSON.stringify(input.delta),
          pendingKey: input.pendingKey,
          identityClaims: input.identityClaims,
        }),
      );
      this.snackbar.open('Alteração enviada para análise dos administradores.', 'Fechar', { duration: 4500 });
      this.load();
    } catch (error: unknown) {
      this.showError(error);
    } finally {
      this.busy.set(false);
    }
  }

  private parseDelta(value?: string): Record<string, unknown> {
    return parseRepresentativeChangeDelta(value);
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return readRepresentativeRecord(value);
  }

  private applyLineup(lineup: SportsLineupRead): void {
    this.matchRevision.set(lineup.matchRevision);
    this.lineupForm.controls.expectedRevision.setValue(lineup.roster?.revision ?? null);
    this.lineupMembers.set(lineupMembersFromRead(lineup));
  }

  private selectInitialMatch(workspace: RepresentativeTeamWorkspace): void {
    const requestedMatchId = this.lineupForm.controls.matchId.value;
    const initial = workspace.matches.find((match) => match.id === requestedMatchId) ?? workspace.matches[0];
    if (initial) {
      this.selectMatch(initial.id);
    }
  }

  private readShirtNumber(value: string | null): string | null {
    return normalizeShirtNumber(value);
  }

  private revokeLogoPreview(): void {
    const previewUrl = this.logoPreviewUrl();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      this.logoPreviewUrl.set(null);
    }
  }

  private uuid(): string {
    return createSportsOperationId();
  }

  private showError(error: unknown): void {
    this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível enviar a alteração.', 'Fechar', {
      duration: 6000,
    });
  }
}
