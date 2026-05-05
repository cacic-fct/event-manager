import { Injectable, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { Event, MajorEvent, MajorEventInput } from '../../graphql/models';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceMajorEventsService {
  private readonly api = inject(MajorEventApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);

  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly selectedMajorEvent = signal<MajorEvent | null>(null);
  readonly majorEventEvents = signal<Event[]>([]);
  readonly majorEventEventSearchResults = signal<Event[]>([]);

  readonly majorEventForm = this.formBuilder.nonNullable.group(
    {
      id: [''],
      name: ['', [Validators.required]],
      emoji: ['🎟️', [Validators.required]],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      description: [''],
      subscriptionStartDate: [''],
      subscriptionEndDate: [''],
      maxCoursesPerAttendee: [''],
      maxLecturesPerAttendee: [''],
      buttonText: [''],
      buttonLink: [''],
      contactInfo: [''],
      contactType: [''],
      isPaymentRequired: [false],
      additionalPaymentInfo: [''],
      paymentBankName: [''],
      paymentAgency: [''],
      paymentAccount: [''],
      paymentHolder: [''],
      paymentDocument: [''],
    },
    {
      validators: [this.requireBothOrNeither('buttonText', 'buttonLink')],
    },
  );

  readonly majorEventEventSearchForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  async loadMajorEvents(): Promise<void> {
    this.majorEvents.set(
      await firstValueFrom(this.api.listMajorEvents({ take: 200 })),
    );
    const selectedMajorEvent = this.selectedMajorEvent();
    if (selectedMajorEvent) {
      const refreshed = this.majorEvents().find(
        (majorEvent) => majorEvent.id === selectedMajorEvent.id,
      );
      if (refreshed) {
        this.selectedMajorEvent.set(refreshed);
      }
    }
  }

  async saveMajorEvent(): Promise<void> {
    if (this.majorEventForm.invalid) {
      this.majorEventForm.markAllAsTouched();
      return;
    }

    const raw = this.majorEventForm.getRawValue();
    const payload = this.buildMajorEventPayload();

    if (raw.id) {
      const updatedMajorEvent = await firstValueFrom(
        this.api.updateMajorEvent(raw.id, payload),
      );
      this.snackbar.open('Grande evento atualizado.', 'Fechar', {
        duration: 2500,
      });
      await this.loadMajorEvents();
      this.pickMajorEvent(updatedMajorEvent);
    } else {
      await firstValueFrom(this.api.createMajorEvent(payload));
      this.snackbar.open('Grande evento criado.', 'Fechar', {
        duration: 2500,
      });
      this.resetMajorEventForm();
      await this.loadMajorEvents();
    }
  }

  resetMajorEventForm(): void {
    this.selectedMajorEvent.set(null);
    this.majorEventEvents.set([]);
    this.majorEventEventSearchResults.set([]);
    this.majorEventEventSearchForm.reset({
      query: '',
    });
    this.majorEventForm.reset({
      id: '',
      name: '',
      emoji: '🎟️',
      startDate: '',
      endDate: '',
      description: '',
      subscriptionStartDate: '',
      subscriptionEndDate: '',
      maxCoursesPerAttendee: '',
      maxLecturesPerAttendee: '',
      buttonText: '',
      buttonLink: '',
      contactInfo: '',
      contactType: '',
      isPaymentRequired: false,
      additionalPaymentInfo: '',
      paymentBankName: '',
      paymentAgency: '',
      paymentAccount: '',
      paymentHolder: '',
      paymentDocument: '',
    });
  }

  pickMajorEvent(majorEvent: MajorEvent): void {
    this.selectedMajorEvent.set(majorEvent);
    this.majorEventEventSearchForm.reset({
      query: '',
    });
    this.majorEventEventSearchResults.set([]);
    this.majorEventForm.reset({
      id: majorEvent.id,
      name: majorEvent.name,
      emoji: majorEvent.emoji,
      startDate: this.fromIsoToLocalInput(majorEvent.startDate),
      endDate: this.fromIsoToLocalInput(majorEvent.endDate),
      description: majorEvent.description ?? '',
      subscriptionStartDate:
        majorEvent.subscriptionStartDate != null
          ? this.fromIsoToLocalInput(majorEvent.subscriptionStartDate)
          : '',
      subscriptionEndDate:
        majorEvent.subscriptionEndDate != null
          ? this.fromIsoToLocalInput(majorEvent.subscriptionEndDate)
          : '',
      maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee?.toString() ?? '',
      maxLecturesPerAttendee:
        majorEvent.maxLecturesPerAttendee?.toString() ?? '',
      buttonText: majorEvent.buttonText ?? '',
      buttonLink: majorEvent.buttonLink ?? '',
      contactInfo: majorEvent.contactInfo ?? '',
      contactType: majorEvent.contactType ?? '',
      isPaymentRequired: majorEvent.isPaymentRequired,
      additionalPaymentInfo: majorEvent.additionalPaymentInfo ?? '',
      paymentBankName: majorEvent.paymentInfo?.bankName ?? '',
      paymentAgency: majorEvent.paymentInfo?.agency ?? '',
      paymentAccount: majorEvent.paymentInfo?.account ?? '',
      paymentHolder: majorEvent.paymentInfo?.holder ?? '',
      paymentDocument: majorEvent.paymentInfo?.document ?? '',
    });
    void this.loadEventsForMajorEvent(majorEvent.id);
  }

  async deleteMajorEvent(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteMajorEvent(id));
    this.snackbar.open('Grande evento excluído.', 'Fechar', {
      duration: 2500,
    });
    if (this.selectedMajorEvent()?.id === id) {
      this.resetMajorEventForm();
    }
    await this.loadMajorEvents();
  }

  async searchEventsForSelectedMajorEvent(): Promise<void> {
    const selectedMajorEvent = this.selectedMajorEvent();
    if (!selectedMajorEvent) {
      return;
    }

    const query = this.majorEventEventSearchForm.controls.query.value.trim();
    if (!query) {
      this.majorEventEventSearchResults.set([]);
      return;
    }

    const events = await firstValueFrom(
      this.eventsApi.listEvents({ query, take: 20 }),
    );
    this.majorEventEventSearchResults.set(
      events.filter(
        (eventItem) => eventItem.majorEventId !== selectedMajorEvent.id,
      ),
    );
  }

  async addEventToSelectedMajorEvent(eventItem: Event): Promise<void> {
    const selectedMajorEvent = this.selectedMajorEvent();
    if (!selectedMajorEvent) {
      return;
    }

    await firstValueFrom(
      this.eventsApi.updateEvent(eventItem.id, {
        majorEventId: selectedMajorEvent.id,
      }),
    );
    await this.loadEventsForMajorEvent(selectedMajorEvent.id);
  }

  async removeEventFromSelectedMajorEvent(eventItem: Event): Promise<void> {
    const selectedMajorEvent = this.selectedMajorEvent();
    if (!selectedMajorEvent) {
      return;
    }

    await firstValueFrom(
      this.eventsApi.updateEvent(eventItem.id, {
        majorEventId: null,
      }),
    );
    await this.loadEventsForMajorEvent(selectedMajorEvent.id);
  }

  private buildMajorEventPayload(): MajorEventInput {
    const raw = this.majorEventForm.getRawValue();
    const paymentInfoInput = {
      bankName: raw.paymentBankName.trim(),
      agency: raw.paymentAgency.trim(),
      account: raw.paymentAccount.trim(),
      holder: raw.paymentHolder.trim(),
      document: raw.paymentDocument.trim(),
    };
    const hasAnyPaymentInfo = Object.values(paymentInfoInput).some(
      (value) => value.length > 0,
    );

    return {
      name: raw.name.trim(),
      emoji: raw.emoji.trim(),
      startDate: this.toIsoDateTime(raw.startDate),
      endDate: this.toIsoDateTime(raw.endDate),
      description: raw.description.trim() || null,
      subscriptionStartDate: this.toOptionalIsoDateTime(
        raw.subscriptionStartDate,
      ),
      subscriptionEndDate: this.toOptionalIsoDateTime(raw.subscriptionEndDate),
      maxCoursesPerAttendee: this.toOptionalNumber(raw.maxCoursesPerAttendee),
      maxLecturesPerAttendee: this.toOptionalNumber(raw.maxLecturesPerAttendee),
      buttonText: raw.buttonText.trim() || null,
      buttonLink: raw.buttonLink.trim() || null,
      contactInfo: raw.contactInfo.trim() || null,
      contactType: raw.contactType
        ? (raw.contactType as MajorEventInput['contactType'])
        : null,
      isPaymentRequired: raw.isPaymentRequired,
      additionalPaymentInfo: raw.additionalPaymentInfo.trim() || null,
      paymentInfo: hasAnyPaymentInfo ? paymentInfoInput : null,
    };
  }

  private async loadEventsForMajorEvent(majorEventId: string): Promise<void> {
    this.majorEventEvents.set(
      await firstValueFrom(
        this.eventsApi.listEvents({
          majorEventId,
          take: 200,
        }),
      ),
    );
  }

  private toIsoDateTime(rawValue: string): string {
    return new Date(rawValue).toISOString();
  }

  private toOptionalIsoDateTime(rawValue: string): string | null {
    return rawValue.trim() ? this.toIsoDateTime(rawValue) : null;
  }

  private toOptionalNumber(rawValue: string): number | null {
    return rawValue.trim() ? Number(rawValue) : null;
  }

  private fromIsoToLocalInput(rawValue: string): string {
    const date = new Date(rawValue);
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs)
      .toISOString()
      .slice(0, 16);
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
}
