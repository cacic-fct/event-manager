import { Component, computed, effect, inject, input, model, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { EventAudience } from '@cacic-fct/shared-event-participation';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { PersonSearchComponent } from '../../people/person-search/person-search.component';
import {
  COURSE_CODE_COMPUTER_SCIENCE,
  normalizeAudienceCourseCodes,
  type AudienceInvitationPerson,
  type AudienceParentRestriction,
} from './audience-editor.models';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';

interface AudienceOption {
  value: EventAudience;
  label: string;
  description: string;
}

const PERSON_LOOKUP_BATCH_SIZE = 50;
let nextAudienceEditorId = 0;

@Component({
  selector: 'app-audience-editor',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    PersonSearchComponent,
  ],
  templateUrl: './audience-editor.component.html',
  styleUrl: './audience-editor.component.scss',
})
export class AudienceEditorComponent {
  private readonly peopleApi = inject(PeopleApiService);
  private readonly permissions = inject(PermissionsService);
  private searchRequestNumber = 0;
  protected readonly editorTitleId = `audience-editor-title-${nextAudienceEditorId++}`;
  protected readonly invitationsTitleId = `audience-invitations-title-${nextAudienceEditorId++}`;

  readonly audience = model<EventAudience>(EventAudience.PUBLIC);
  readonly courseCodes = model<string[]>([]);
  readonly invitedPeople = model<AudienceInvitationPerson[]>([]);
  readonly parentRestrictions = input<readonly AudienceParentRestriction[]>([]);
  readonly manageAttendanceInvitations = input(false);
  readonly publicationError = input<string | null>(null);
  readonly readOnly = input(false);

  protected readonly EventAudience = EventAudience;
  protected readonly audienceOptions: readonly AudienceOption[] = [
    {
      value: EventAudience.PUBLIC,
      label: 'Público',
      description: 'Qualquer pessoa pode acessar neste nível.',
    },
    {
      value: EventAudience.UNESP_ONLY,
      label: 'Somente Unesp',
      description: 'Exige e-mail principal ou secundário com domínio @unesp.br.',
    },
    {
      value: EventAudience.COURSE_ONLY,
      label: 'Somente Ciência da Computação',
      description: 'Exige matrícula confirmada no Account Manager.',
    },
    {
      value: EventAudience.INVITATION_ONLY,
      label: 'Somente pessoas convidadas',
      description: 'Permite acesso apenas às pessoas selecionadas abaixo.',
    },
  ];
  protected readonly courseOptions = [{ value: COURSE_CODE_COMPUTER_SCIENCE, label: 'Ciência da Computação' }];
  protected readonly showInvitationManagement = computed(
    () => this.audience() === EventAudience.INVITATION_ONLY || this.manageAttendanceInvitations(),
  );
  protected readonly invitationSectionTitle = computed(() =>
    this.audience() === EventAudience.INVITATION_ONLY ? 'Pessoas convidadas' : 'Pessoas convidadas para presença',
  );
  protected readonly invitationSectionCopy = computed(() => {
    const managesAccess = this.audience() === EventAudience.INVITATION_ONLY;
    const managesAttendance = this.manageAttendanceInvitations();
    const scope =
      managesAccess && managesAttendance
        ? 'Esta lista controla o acesso e a confirmação de presença.'
        : managesAccess
          ? 'Esta lista controla o acesso; a regra de confirmação de presença é configurada separadamente.'
          : 'Esta lista é usada para confirmar presença; o público de acesso acima é configurado separadamente.';
    const notification = managesAccess
      ? ' Os convites são enviados depois de salvar, quando o acesso à atividade estiver disponível.'
      : '';
    return `${scope}${notification}`;
  });
  protected readonly unresolvedInvitationCount = computed(
    () => this.invitedPeople().filter((person) => person.unresolved).length,
  );
  protected readonly invitationDataWarning = computed(() => {
    const count = this.unresolvedInvitationCount();
    return count > 0
      ? `${count === 1 ? 'Uma pessoa convidada está' : `${count} pessoas convidadas estão`} sem dados carregados. O convite será mantido; verifique a permissão de Pessoa: Visualizar para exibir os dados.`
      : null;
  });

  protected readonly searchQuery = signal('');
  protected readonly searchResults = signal<Person[]>([]);
  protected readonly searchLoading = signal(false);
  protected readonly searchError = signal<string | null>(null);
  protected readonly selectedAudienceHint = computed(() => {
    switch (this.audience()) {
      case EventAudience.UNESP_ONLY:
        return 'A pessoa precisa ter e-mail principal ou secundário @unesp.br vinculado.';
      case EventAudience.COURSE_ONLY:
        return 'Exige matrícula confirmada no Account Manager. Se a confirmação dificultar o acesso, escolha Somente Unesp.';
      case EventAudience.INVITATION_ONLY:
        return 'Quem estiver nesta lista poderá acessar, desde que também atenda às restrições dos níveis acima.';
      case EventAudience.PUBLIC:
      default:
        return 'Público não adiciona uma restrição própria.';
    }
  });
  protected readonly parentRestrictionCopy = computed(() => {
    const parents = this.parentRestrictions();
    if (parents.length === 0) {
      return 'Este é o nível mais amplo: Público não adiciona uma restrição própria.';
    }

    const descriptions = parents.map((parent) => `${parent.label}: ${this.describeRestriction(parent)}`);
    return `Restrições herdadas: ${descriptions.join('; ')}. As regras se acumulam: Público não remove nenhuma regra dos níveis acima.`;
  });
  protected readonly availableSearchResults = computed(() => {
    const selectedIds = new Set(this.invitedPeople().map((person) => person.id));
    return this.searchResults().filter((person) => !selectedIds.has(person.id));
  });
  protected readonly canSearchPeople = computed(() => this.permissions.has(Permission.Person.Read));
  protected readonly searchDisabledReason = computed(() => {
    if (!this.canSearchPeople()) {
      return 'Buscar pessoas exige permissão de Pessoa: Visualizar.';
    }

    return 'A edição de convites está bloqueada para este registro.';
  });

  constructor() {
    effect(() => {
      const normalizedCodes = normalizeAudienceCourseCodes(this.audience());
      if (normalizedCodes.join(',') !== this.courseCodes().join(',')) {
        this.courseCodes.set(normalizedCodes);
      }
    });
  }

  protected selectAudience(value: EventAudience): void {
    if (this.readOnly() || !Object.values(EventAudience).includes(value)) {
      return;
    }

    this.audience.set(value);
    if (value === EventAudience.COURSE_ONLY && this.courseCodes().length === 0) {
      this.courseCodes.set([COURSE_CODE_COMPUTER_SCIENCE]);
    }
    if (value !== EventAudience.COURSE_ONLY) {
      this.courseCodes.set([]);
    }
  }

  protected setCourseCodes(value: readonly string[] | null | undefined): void {
    if (this.readOnly()) {
      return;
    }

    this.courseCodes.set((value ?? []).filter((code): code is string => code === COURSE_CODE_COMPUTER_SCIENCE));
  }

  protected onSearchQueryChange(query: string): void {
    this.searchQuery.set(query);
    this.searchError.set(null);
    if (query.trim().length < 2) {
      this.searchResults.set([]);
    }
  }

  protected async searchPeople(query: string): Promise<void> {
    const normalized = query.trim();
    this.searchQuery.set(query);
    this.searchError.set(null);
    const requestNumber = ++this.searchRequestNumber;
    if (!normalized || normalized.length < 2 || this.readOnly() || !this.permissions.has(Permission.Person.Read)) {
      this.searchResults.set([]);
      return;
    }

    this.searchLoading.set(true);
    try {
      const people = await firstValueFrom(this.peopleApi.listPeopleSummaries({ query: normalized, take: 20 }));
      if (requestNumber === this.searchRequestNumber) {
        this.searchResults.set(people);
      }
    } catch {
      if (requestNumber === this.searchRequestNumber) {
        this.searchResults.set([]);
        this.searchError.set('Não foi possível buscar pessoas. Tente novamente.');
      }
    } finally {
      if (requestNumber === this.searchRequestNumber) {
        this.searchLoading.set(false);
      }
    }
  }

  protected addInvitedPerson(person: AudienceInvitationPerson): void {
    if (this.readOnly() || this.invitedPeople().some((selected) => selected.id === person.id)) {
      return;
    }

    this.invitedPeople.set([...this.invitedPeople(), person]);
    this.searchQuery.set('');
    this.searchResults.set([]);
  }

  protected removeInvitedPerson(personId: string): void {
    if (this.readOnly()) {
      return;
    }

    this.invitedPeople.set(this.invitedPeople().filter((person) => person.id !== personId));
  }

  protected async retryUnresolvedInvitations(): Promise<void> {
    if (this.readOnly() || !this.canSearchPeople()) {
      return;
    }

    const unresolved = this.invitedPeople().filter((person) => person.unresolved);
    const resolved: AudienceInvitationPerson[] = [];
    for (let index = 0; index < unresolved.length; index += PERSON_LOOKUP_BATCH_SIZE) {
      const batch = unresolved.slice(index, index + PERSON_LOOKUP_BATCH_SIZE);
      resolved.push(
        ...(await Promise.all(
          batch.map(async (invitedPerson) => {
            try {
              const person = await firstValueFrom(this.peopleApi.getPerson(invitedPerson.id));
              if (person.id !== invitedPerson.id) {
                return invitedPerson;
              }
              return {
                id: person.id,
                name: person.name,
                email: person.email,
              } satisfies AudienceInvitationPerson;
            } catch {
              return invitedPerson;
            }
          }),
        )),
      );
    }
    const resolvedById = new Map(resolved.map((person) => [person.id, person]));
    this.invitedPeople.set(this.invitedPeople().map((person) => resolvedById.get(person.id) ?? person));
  }

  protected courseLabel(code: string): string {
    return this.courseOptions.find((option) => option.value === code)?.label ?? `Código de curso ${code}`;
  }

  private describeRestriction(parent: AudienceParentRestriction): string {
    if (parent.unavailable || parent.audience == null) {
      return 'a regra do nível acima não está disponível nesta tela e continua valendo';
    }

    switch (parent.audience ?? EventAudience.PUBLIC) {
      case EventAudience.UNESP_ONLY:
        return 'somente pessoas da Unesp';
      case EventAudience.COURSE_ONLY:
        return `somente ${parent.audienceCourseCodes?.map((code) => this.courseLabel(code)).join(', ') || 'o curso selecionado'}`;
      case EventAudience.INVITATION_ONLY:
        return 'somente pessoas convidadas';
      case EventAudience.PUBLIC:
      default:
        return 'público, sem restrição adicional';
    }
  }
}
