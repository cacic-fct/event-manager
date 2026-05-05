import { Injectable, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { Event, EventGroup, EventInput, Person } from '../../graphql/models';
import { PersonCreateDialogComponent } from '../../workspace/dialogs/person-create-dialog.component';
import {
  buildEventListFilters,
  resetEventFiltersForm,
} from '../event-list-filters';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspaceUiService } from './workspace-ui.service';

const NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS =
  '2345689ABCDEFGHKMNPQRSTWXYZ';
const BANNED_ATTENDANCE_CODES = new Set([
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  'AAAA',
  'BBBB',
  'CCCC',
  'DDDD',
  'EEEE',
  'FFFF',
  'GGGG',
  'HHHH',
  'KKKK',
  'MMMM',
  'NNNN',
  'PPPP',
  'QQQQ',
  'RRRR',
  'SSSS',
  'TTTT',
  'WWWW',
  'XXXX',
  'YYYY',
  'ZZZZ',
  'PENS',
  'ANWS',
]);

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventsService {
  private readonly api = inject(EventApiService);
  private readonly eventGroupsApi = inject(EventGroupApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);
  private readonly ui = inject(WorkspaceUiService);

  readonly majorEvents = this.majorEventsService.majorEvents;
  readonly loading = this.ui.loading;

  readonly events = signal<Event[]>([]);
  readonly selectedEvent = signal<Event | null>(null);
  readonly eventLecturers = signal<{ personId: string; name: string }[]>([]);
  readonly selectedEventGroupName = signal('');
  readonly eventGroupSearchResults = signal<EventGroup[]>([]);
  readonly lecturerSearchResults = signal<Person[]>([]);

  readonly eventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateTo: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
  });

  readonly eventForm = this.formBuilder.nonNullable.group(
    {
      id: [''],
      name: ['', [Validators.required]],
      creditDisplayMode: ['hours'],
      creditValue: this.formBuilder.control<number | string | null>(null, [
        Validators.min(0),
      ]),
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      emoji: ['', [Validators.required]],
      type: ['OTHER', [Validators.required]],
      description: [''],
      shortDescription: [''],
      latitude: [''],
      longitude: [''],
      locationDescription: [''],
      majorEventId: [''],
      eventGroupId: [''],
      allowSubscription: [false],
      subscriptionStartDate: [''],
      subscriptionEndDate: [''],
      slots: [''],
      autoSubscribe: [false],
      shouldIssueCertificate: [false],
      shouldCollectAttendance: [false],
      isOnlineAttendanceAllowed: [false],
      onlineAttendanceCode: [''],
      onlineAttendanceStartDate: [''],
      onlineAttendanceEndDate: [''],
      publiclyVisible: [true],
      youtubeCode: [''],
      buttonText: [''],
      buttonLink: [''],
    },
    {
      validators: [
        this.requireBothOrNeither('latitude', 'longitude'),
        this.requireBothOrNeither('buttonText', 'buttonLink'),
      ],
    },
  );

  readonly eventGroupLookupForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly lecturerLookupForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  constructor() {
    this.syncOnlineAttendanceControls();
    this.eventForm.controls.isOnlineAttendanceAllowed.valueChanges.subscribe(
      () => this.syncOnlineAttendanceControls(),
    );
  }

  async loadEvents(): Promise<void> {
    this.events.set(
      await firstValueFrom(
        this.api.listEvents(buildEventListFilters(this.eventFiltersForm.value)),
      ),
    );
  }

  async applyEventFilters(): Promise<void> {
    await this.loadEvents();
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm);
    await this.loadEvents();
  }

  async selectEvent(eventItem: Event): Promise<void> {
    const eventDetails = await firstValueFrom(this.api.getEvent(eventItem.id));
    this.selectedEvent.set(eventDetails);
    this.populateEventForm(eventDetails);
    this.eventGroupLookupForm.controls.query.setValue(
      eventDetails.eventGroup?.name ?? '',
    );
    this.eventGroupSearchResults.set([]);
    await this.loadEventLecturers(eventItem.id);
  }

  resetEventForm(): void {
    this.selectedEvent.set(null);
    this.eventLecturers.set([]);
    this.eventGroupSearchResults.set([]);
    this.eventGroupLookupForm.reset({
      query: '',
    });
    this.selectedEventGroupName.set('');
    this.eventForm.reset({
      id: '',
      name: '',
      creditDisplayMode: 'hours',
      creditValue: null,
      startDate: '',
      endDate: '',
      emoji: '',
      type: 'OTHER',
      description: '',
      shortDescription: '',
      latitude: '',
      longitude: '',
      locationDescription: '',
      majorEventId: '',
      eventGroupId: '',
      allowSubscription: false,
      subscriptionStartDate: '',
      subscriptionEndDate: '',
      slots: '',
      autoSubscribe: false,
      shouldIssueCertificate: false,
      shouldCollectAttendance: false,
      isOnlineAttendanceAllowed: false,
      onlineAttendanceCode: '',
      onlineAttendanceStartDate: '',
      onlineAttendanceEndDate: '',
      publiclyVisible: true,
      youtubeCode: '',
      buttonText: '',
      buttonLink: '',
    });
    this.syncOnlineAttendanceControls();
  }

  randomizeOnlineAttendanceCode(): void {
    let code = '';
    do {
      code = Array.from(
        { length: 4 },
        () =>
          NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS[
            this.getRandomIndex(
              NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS.length,
            )
          ],
      ).join('');
    } while (BANNED_ATTENDANCE_CODES.has(code));

    this.eventForm.controls.onlineAttendanceCode.setValue(code);
  }

  async saveEvent(): Promise<void> {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    const payload = this.buildEventPayload();
    const eventId = this.eventForm.controls.id.value;

    this.ui.loading.set(true);
    try {
      if (eventId) {
        await firstValueFrom(this.api.updateEvent(eventId, payload));
        this.snackbar.open('Evento atualizado.', 'Fechar', {
          duration: 2500,
        });
      } else {
        await firstValueFrom(this.api.createEvent(payload));
        this.snackbar.open('Evento criado.', 'Fechar', { duration: 2500 });
      }
      await this.loadEvents();
      this.resetEventForm();
    } finally {
      this.ui.loading.set(false);
    }
  }

  async deleteEventFromList(eventItem: Event): Promise<void> {
    await this.deleteEventById(eventItem.id);
  }

  async searchEventGroupsForEvent(): Promise<void> {
    const query = this.eventGroupLookupForm.controls.query.value.trim();
    if (!query) {
      this.eventGroupSearchResults.set([]);
      return;
    }

    this.eventGroupSearchResults.set(
      await firstValueFrom(
        this.eventGroupsApi.listEventGroups({ query, take: 20 }),
      ),
    );
  }

  assignEventGroupToEvent(group: EventGroup): void {
    this.eventForm.controls.eventGroupId.setValue(group.id);
    this.selectedEventGroupName.set(group.name);
    this.eventGroupSearchResults.set([]);
  }

  clearEventGroupFromEvent(): void {
    this.eventForm.controls.eventGroupId.setValue('');
    this.selectedEventGroupName.set('');
    this.eventGroupSearchResults.set([]);
  }

  eventGroupNameById(groupId: string): string {
    if (!groupId) {
      return 'Nenhum grupo selecionado';
    }

    return (
      (this.selectedEventGroupName() ||
        this.eventGroupSearchResults().find((group) => group.id === groupId)
          ?.name) ??
      this.selectedEvent()?.eventGroup?.name ??
      groupId
    );
  }

  async searchLecturerCandidates(): Promise<void> {
    const query = this.lecturerLookupForm.controls.query.value.trim();
    if (!query) {
      this.lecturerSearchResults.set([]);
      return;
    }
    this.lecturerSearchResults.set(
      await firstValueFrom(this.peopleApi.listPeople({ query, take: 10 })),
    );
  }

  async createAndAddLecturer(): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }

    const dialogRef = this.dialog.open(PersonCreateDialogComponent, {
      width: '48rem',
      maxWidth: '95vw',
    });
    const person = await firstValueFrom(dialogRef.afterClosed());
    if (!person) {
      return;
    }

    await firstValueFrom(
      this.api.createEventLecturer({
        eventId: selectedEvent.id,
        personId: person.id,
      }),
    );
    await this.loadEventLecturers(selectedEvent.id);
  }

  async addLecturer(person: Person): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }
    await firstValueFrom(
      this.api.createEventLecturer({
        eventId: selectedEvent.id,
        personId: person.id,
      }),
    );
    await this.loadEventLecturers(selectedEvent.id);
  }

  async removeLecturer(personId: string): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }
    await firstValueFrom(
      this.api.deleteEventLecturer(selectedEvent.id, personId),
    );
    await this.loadEventLecturers(selectedEvent.id);
  }

  private async loadEventLecturers(eventId: string): Promise<void> {
    const lecturers = await firstValueFrom(
      this.api.listEventLecturers(eventId),
    );
    this.eventLecturers.set(
      lecturers.map((lecturer) => ({
        personId: lecturer.personId,
        name: lecturer.person?.name ?? lecturer.personId,
      })),
    );
  }

  private async deleteEventById(eventId: string): Promise<void> {
    await firstValueFrom(this.api.deleteEvent(eventId));
    this.snackbar.open('Evento excluído.', 'Fechar', { duration: 2500 });
    if (this.selectedEvent()?.id === eventId) {
      this.resetEventForm();
    }
    await this.loadEvents();
  }

  private buildEventPayload(): EventInput {
    const raw = this.eventForm.getRawValue();
    const creditValue = this.toOptionalNumber(raw.creditValue);
    const creditMinutes =
      creditValue == null
        ? this.calculateDurationMinutes(raw.startDate, raw.endDate)
        : raw.creditDisplayMode === 'hours'
          ? Math.round(creditValue * 60)
          : Math.round(creditValue);
    const isOnlineAttendanceAllowed = raw.isOnlineAttendanceAllowed;

    return {
      name: raw.name.trim(),
      creditMinutes,
      startDate: this.toIsoDateTime(raw.startDate),
      endDate: this.toIsoDateTime(raw.endDate),
      emoji: raw.emoji.trim(),
      type: raw.type as EventInput['type'],
      description: raw.description.trim() || null,
      shortDescription: raw.shortDescription.trim() || null,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      locationDescription: raw.locationDescription.trim() || null,
      majorEventId: raw.majorEventId || null,
      eventGroupId: raw.eventGroupId || null,
      allowSubscription: raw.allowSubscription,
      subscriptionStartDate: this.toOptionalIsoDateTime(
        raw.subscriptionStartDate,
      ),
      subscriptionEndDate: this.toOptionalIsoDateTime(raw.subscriptionEndDate),
      slots: this.toOptionalNumber(raw.slots),
      autoSubscribe: raw.autoSubscribe,
      shouldIssueCertificate: raw.shouldIssueCertificate,
      shouldCollectAttendance: raw.shouldCollectAttendance,
      isOnlineAttendanceAllowed,
      onlineAttendanceCode: isOnlineAttendanceAllowed
        ? raw.onlineAttendanceCode.trim() || null
        : null,
      onlineAttendanceStartDate: isOnlineAttendanceAllowed
        ? this.toOptionalIsoDateTime(raw.onlineAttendanceStartDate)
        : null,
      onlineAttendanceEndDate: isOnlineAttendanceAllowed
        ? this.toOptionalIsoDateTime(raw.onlineAttendanceEndDate)
        : null,
      publiclyVisible: raw.publiclyVisible,
      youtubeCode: raw.youtubeCode.trim() || null,
      buttonText: raw.buttonText.trim() || null,
      buttonLink: raw.buttonLink.trim() || null,
    };
  }

  private populateEventForm(eventItem: Event): void {
    const asHours = (eventItem.creditMinutes ?? 0) / 60;
    this.eventForm.reset({
      id: eventItem.id,
      name: eventItem.name,
      creditDisplayMode: 'hours',
      creditValue:
        eventItem.creditMinutes == null
          ? null
          : Number.isFinite(asHours)
            ? asHours
            : null,
      startDate: this.fromIsoToLocalInput(eventItem.startDate),
      endDate: this.fromIsoToLocalInput(eventItem.endDate),
      emoji: eventItem.emoji,
      type: eventItem.type,
      description: eventItem.description ?? '',
      shortDescription: eventItem.shortDescription ?? '',
      latitude: eventItem.latitude?.toString() ?? '',
      longitude: eventItem.longitude?.toString() ?? '',
      locationDescription: eventItem.locationDescription ?? '',
      majorEventId: eventItem.majorEventId ?? '',
      eventGroupId: eventItem.eventGroupId ?? '',
      allowSubscription: eventItem.allowSubscription,
      subscriptionStartDate:
        eventItem.subscriptionStartDate != null
          ? this.fromIsoToLocalInput(eventItem.subscriptionStartDate)
          : '',
      subscriptionEndDate:
        eventItem.subscriptionEndDate != null
          ? this.fromIsoToLocalInput(eventItem.subscriptionEndDate)
          : '',
      slots: eventItem.slots?.toString() ?? '',
      autoSubscribe: eventItem.autoSubscribe,
      shouldIssueCertificate: eventItem.shouldIssueCertificate,
      shouldCollectAttendance: eventItem.shouldCollectAttendance,
      isOnlineAttendanceAllowed: eventItem.isOnlineAttendanceAllowed,
      onlineAttendanceCode: eventItem.onlineAttendanceCode ?? '',
      onlineAttendanceStartDate:
        eventItem.onlineAttendanceStartDate != null
          ? this.fromIsoToLocalInput(eventItem.onlineAttendanceStartDate)
          : '',
      onlineAttendanceEndDate:
        eventItem.onlineAttendanceEndDate != null
          ? this.fromIsoToLocalInput(eventItem.onlineAttendanceEndDate)
          : '',
      publiclyVisible: eventItem.publiclyVisible,
      youtubeCode: eventItem.youtubeCode ?? '',
      buttonText: eventItem.buttonText ?? '',
      buttonLink: eventItem.buttonLink ?? '',
    });
    this.syncOnlineAttendanceControls();
    this.eventGroupLookupForm.controls.query.setValue(
      eventItem.eventGroup?.name ?? '',
    );
    this.selectedEventGroupName.set(eventItem.eventGroup?.name ?? '');
    this.eventGroupSearchResults.set([]);
  }

  private toIsoDateTime(rawValue: string): string {
    return new Date(rawValue).toISOString();
  }

  private toOptionalIsoDateTime(rawValue: string): string | null {
    return rawValue.trim() ? this.toIsoDateTime(rawValue) : null;
  }

  private toOptionalNumber(rawValue: number | string | null): number | null {
    if (rawValue == null || rawValue === '') {
      return null;
    }

    return Number(rawValue);
  }

  private fromIsoToLocalInput(rawValue: string): string {
    const date = new Date(rawValue);
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs)
      .toISOString()
      .slice(0, 16);
  }

  private calculateDurationMinutes(
    startDate: string,
    endDate: string,
  ): number | null {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }

    return Math.round((end - start) / 60_000);
  }

  private requireBothOrNeither(firstKey: string, secondKey: string) {
    return (control: AbstractControl): ValidationErrors | null => {
      const firstValue = control.get(firstKey)?.value?.toString().trim();
      const secondValue = control.get(secondKey)?.value?.toString().trim();
      return (firstValue && !secondValue) || (!firstValue && secondValue)
        ? { [`${firstKey}Requires${secondKey}`]: true }
        : null;
    };
  }

  private syncOnlineAttendanceControls(): void {
    const onlineControls = [
      this.eventForm.controls.onlineAttendanceCode,
      this.eventForm.controls.onlineAttendanceStartDate,
      this.eventForm.controls.onlineAttendanceEndDate,
    ];
    const shouldEnable =
      this.eventForm.controls.isOnlineAttendanceAllowed.value;

    for (const control of onlineControls) {
      if (shouldEnable) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
      }
    }
  }

  private getRandomIndex(maxExclusive: number): number {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    return randomValue[0] % maxExclusive;
  }
}
