import { Injectable, inject, signal } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { Event, MajorEvent, MajorEventInput, PriceType } from '../../graphql/models';
import { getErrorMessage } from '../error-message';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceMajorEventsService {
  private readonly api = inject(MajorEventApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly selectedMajorEvent = signal<MajorEvent | null>(null);
  readonly majorEventEvents = signal<Event[]>([]);
  readonly majorEventEventSearchResults = signal<Event[]>([]);

  readonly majorEventForm = this.formBuilder.nonNullable.group(
    {
      id: [''],
      name: ['', [Validators.required]],
      emoji: ['', [Validators.required]],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      description: [''],
      subscriptionStartDate: [''],
      subscriptionEndDate: [''],
      maxCoursesPerAttendee: [''],
      maxLecturesPerAttendee: [''],
      maxUncategorizedPerAttendee: [''],
      rankedSubscriptionEnabled: [false],
      buttonText: [''],
      buttonLink: [''],
      contactInfo: [''],
      contactType: [''],
      isPaymentRequired: [false],
      shouldIssueCertificateForNonPayingAttendees: [false],
      shouldIssueCertificateForNonSubscribedAttendees: [false],
      additionalPaymentInfo: [''],
      paymentBankName: [''],
      paymentAgency: [''],
      paymentAccount: [''],
      paymentHolder: [''],
      paymentDocument: [''],
      pixKey: [''],
      pixCity: [''],
      priceType: ['SINGLE' as PriceType],
      priceTiers: this.formBuilder.array([this.createPriceTierGroup('Preço único', '')]),
    },
    {
      validators: [this.requireBothOrNeither('buttonText', 'buttonLink'), this.validatePaymentInfo()],
    },
  );

  readonly majorEventEventSearchForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  constructor() {
    this.majorEventForm.controls.isPaymentRequired.valueChanges.subscribe(() =>
      this.syncCertificateExceptionControls(),
    );
    this.majorEventForm.controls.priceType.valueChanges.subscribe((type) => this.syncPriceTierControls(type));
  }

  get priceTiers(): FormArray<ReturnType<WorkspaceMajorEventsService['createPriceTierGroup']>> {
    return this.majorEventForm.controls.priceTiers;
  }

  addPriceTier(): void {
    this.priceTiers.push(this.createPriceTierGroup('', ''));
    this.syncPriceTierControls(this.majorEventForm.controls.priceType.value);
  }

  removePriceTier(index: number): void {
    if (this.priceTiers.length <= 1) {
      return;
    }

    this.priceTiers.removeAt(index);
    this.syncPriceTierControls(this.majorEventForm.controls.priceType.value);
  }

  async loadMajorEvents(): Promise<void> {
    this.majorEvents.set(await firstValueFrom(this.api.listMajorEvents({ take: 200 })));
    const selectedMajorEvent = this.selectedMajorEvent();
    if (selectedMajorEvent) {
      const refreshed = this.majorEvents().find((majorEvent) => majorEvent.id === selectedMajorEvent.id);
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

    try {
      if (raw.id) {
        const updatedMajorEvent = await firstValueFrom(this.api.updateMajorEvent(raw.id, payload));
        this.snackbar.open('Grande evento atualizado.', 'Fechar', {
          duration: 2500,
        });
        await this.loadMajorEvents();
        await this.pickMajorEvent(updatedMajorEvent);
      } else {
        await firstValueFrom(this.api.createMajorEvent(payload));
        this.snackbar.open('Grande evento criado.', 'Fechar', {
          duration: 2500,
        });
        this.resetMajorEventForm();
        await this.loadMajorEvents();
      }
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o grande evento.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  resetMajorEventForm(): void {
    void this.router.navigate(['/major-events']);
    this.selectedMajorEvent.set(null);
    this.majorEventEvents.set([]);
    this.majorEventEventSearchResults.set([]);
    this.majorEventEventSearchForm.reset({
      query: '',
    });
    this.majorEventForm.reset({
      id: '',
      name: '',
      emoji: '',
      startDate: '',
      endDate: '',
      description: '',
      subscriptionStartDate: '',
      subscriptionEndDate: '',
      maxCoursesPerAttendee: '',
      maxLecturesPerAttendee: '',
      maxUncategorizedPerAttendee: '',
      rankedSubscriptionEnabled: false,
      buttonText: '',
      buttonLink: '',
      contactInfo: '',
      contactType: '',
      isPaymentRequired: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      additionalPaymentInfo: '',
      paymentBankName: '',
      paymentAgency: '',
      paymentAccount: '',
      paymentHolder: '',
      paymentDocument: '',
      pixKey: '',
      pixCity: '',
      priceType: 'SINGLE',
    });
    this.resetPriceTiers([this.createPriceTierGroup('Preço único', '')]);
    this.syncCertificateExceptionControls();
  }

  async pickMajorEvent(majorEvent: MajorEvent): Promise<void> {
    void this.router.navigate(['/major-events', majorEvent.id]);
    this.populateMajorEventSelection(majorEvent);
  }

  async pickMajorEventById(majorEventId: string): Promise<void> {
    if (this.selectedMajorEvent()?.id === majorEventId) {
      return;
    }

    const majorEvent = await firstValueFrom(this.api.getMajorEvent(majorEventId));
    this.populateMajorEventSelection(majorEvent);
  }

  private populateMajorEventSelection(majorEvent: MajorEvent): void {
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
        majorEvent.subscriptionStartDate != null ? this.fromIsoToLocalInput(majorEvent.subscriptionStartDate) : '',
      subscriptionEndDate:
        majorEvent.subscriptionEndDate != null ? this.fromIsoToLocalInput(majorEvent.subscriptionEndDate) : '',
      maxCoursesPerAttendee: majorEvent.maxCoursesPerAttendee?.toString() ?? '',
      maxLecturesPerAttendee: majorEvent.maxLecturesPerAttendee?.toString() ?? '',
      maxUncategorizedPerAttendee: majorEvent.maxUncategorizedPerAttendee?.toString() ?? '',
      rankedSubscriptionEnabled: Boolean(majorEvent.rankedSubscriptionEnabled),
      buttonText: majorEvent.buttonText ?? '',
      buttonLink: majorEvent.buttonLink ?? '',
      contactInfo: majorEvent.contactInfo ?? '',
      contactType: majorEvent.contactType ?? '',
      isPaymentRequired: majorEvent.isPaymentRequired,
      shouldIssueCertificateForNonPayingAttendees: majorEvent.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: majorEvent.shouldIssueCertificateForNonSubscribedAttendees,
      additionalPaymentInfo: majorEvent.additionalPaymentInfo ?? '',
      paymentBankName: majorEvent.paymentInfo?.bankName ?? '',
      paymentAgency: majorEvent.paymentInfo?.agency ?? '',
      paymentAccount: majorEvent.paymentInfo?.account ?? '',
      paymentHolder: majorEvent.paymentInfo?.holder ?? '',
      paymentDocument: majorEvent.paymentInfo?.document ?? '',
      pixKey: majorEvent.paymentInfo?.pixKey ?? '',
      pixCity: majorEvent.paymentInfo?.pixCity ?? '',
      priceType: majorEvent.majorEventPrices[0]?.type ?? 'SINGLE',
    });
    const price = majorEvent.majorEventPrices[0];
    this.resetPriceTiers(
      price?.tiers.length
        ? price.tiers.map((tier) => this.createPriceTierGroup(tier.name, (tier.value / 100).toFixed(2)))
        : [this.createPriceTierGroup('Preço único', '')],
    );
    this.syncCertificateExceptionControls();
    void this.loadEventsForMajorEvent(majorEvent.id);
  }

  async deleteMajorEvent(id: string): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteMajorEvent(id));
      this.snackbar.open('Grande evento excluído.', 'Fechar', {
        duration: 2500,
      });
      if (this.selectedMajorEvent()?.id === id) {
        this.resetMajorEventForm();
      }
      await this.loadMajorEvents();
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir o grande evento.'), 'Fechar', {
        duration: 5000,
      });
    }
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

    const events = await firstValueFrom(this.eventsApi.listEvents({ query, take: 20 }));
    this.majorEventEventSearchResults.set(
      events.filter((eventItem) => eventItem.majorEventId !== selectedMajorEvent.id),
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
      pixKey: raw.pixKey.trim(),
      pixCity: raw.pixCity.trim(),
    };
    const hasAnyPaymentInfo = Object.values(paymentInfoInput).some((value) => value.length > 0);
    const priceTiers = this.priceTiers.controls
      .map((tierControl) => tierControl.getRawValue())
      .map((tier) => ({
        name: tier.name.trim(),
        value: this.toCents(tier.value),
      }))
      .filter((tier) => tier.name.length > 0 || tier.value !== null);
    const validPriceTiers = priceTiers.filter((tier): tier is { name: string; value: number } => tier.value !== null);

    return {
      name: raw.name.trim(),
      emoji: raw.emoji.trim(),
      startDate: this.toIsoDateTime(raw.startDate),
      endDate: this.toIsoDateTime(raw.endDate),
      description: raw.description.trim() || null,
      subscriptionStartDate: this.toOptionalIsoDateTime(raw.subscriptionStartDate),
      subscriptionEndDate: this.toOptionalIsoDateTime(raw.subscriptionEndDate),
      maxCoursesPerAttendee: this.toOptionalNumber(raw.maxCoursesPerAttendee),
      maxLecturesPerAttendee: this.toOptionalNumber(raw.maxLecturesPerAttendee),
      maxUncategorizedPerAttendee: this.toOptionalNumber(raw.maxUncategorizedPerAttendee),
      rankedSubscriptionEnabled: raw.rankedSubscriptionEnabled,
      buttonText: raw.buttonText.trim() || null,
      buttonLink: raw.buttonLink.trim() || null,
      contactInfo: raw.contactInfo.trim() || null,
      contactType: raw.contactType ? (raw.contactType as MajorEventInput['contactType']) : null,
      isPaymentRequired: raw.isPaymentRequired,
      shouldIssueCertificateForNonPayingAttendees:
        !raw.isPaymentRequired && raw.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: raw.shouldIssueCertificateForNonSubscribedAttendees,
      additionalPaymentInfo: raw.additionalPaymentInfo.trim() || null,
      paymentInfo: hasAnyPaymentInfo ? paymentInfoInput : null,
      price:
        validPriceTiers.length > 0
          ? {
              type: raw.priceType,
              tiers: validPriceTiers,
            }
          : null,
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

  private toOptionalIsoDateTime(rawValue: string | null | undefined): string | null {
    if (!rawValue || typeof rawValue !== 'string') return null;
    return rawValue.trim() ? this.toIsoDateTime(rawValue) : null;
  }

  private toOptionalNumber(rawValue: string | null | undefined): number | null {
    if (!rawValue || typeof rawValue !== 'string') return null;
    return rawValue.trim() ? Number(rawValue) : null;
  }

  private toCents(rawValue: string | number | null | undefined): number | null {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
      return null;
    }

    const parsed = typeof rawValue === 'number' ? rawValue : Number(rawValue.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }

  private createPriceTierGroup(name: string, value: string) {
    return this.formBuilder.nonNullable.group({
      name: [name],
      value: [value],
    });
  }

  private resetPriceTiers(groups: ReturnType<WorkspaceMajorEventsService['createPriceTierGroup']>[]): void {
    this.priceTiers.clear();
    for (const group of groups) {
      this.priceTiers.push(group);
    }
    this.syncPriceTierControls(this.majorEventForm.controls.priceType.value);
  }

  private fromIsoToLocalInput(rawValue: string): string {
    const date = new Date(rawValue);
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
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

  private validatePaymentInfo() {
    return (control: AbstractControl): ValidationErrors | null => {
      const bankFields = ['paymentBankName', 'paymentAgency', 'paymentAccount', 'paymentHolder'];
      const bankValues = bankFields.map((key) => control.get(key)?.value?.toString().trim() ?? '');
      const hasAnyBankValue = bankValues.some((value) => value.length > 0);
      const hasAllBankValues = bankValues.every((value) => value.length > 0);
      const document = control.get('paymentDocument')?.value?.toString().trim() ?? '';

      if (hasAnyBankValue && !hasAllBankValues) {
        return { incompleteBankPaymentInfo: true };
      }

      if (hasAllBankValues && !document) {
        return { bankPaymentDocumentRequired: true };
      }

      return null;
    };
  }

  private syncPriceTierControls(type: PriceType): void {
    if (type === 'SINGLE') {
      while (this.priceTiers.length > 1) {
        this.priceTiers.removeAt(this.priceTiers.length - 1);
      }
      const tier = this.priceTiers.at(0) as ReturnType<WorkspaceMajorEventsService['createPriceTierGroup']> | null;
      if (tier && !tier.controls.name.value.trim()) {
        tier.controls.name.setValue('Preço único', { emitEvent: false });
      }
    }
  }

  private syncCertificateExceptionControls(): void {
    const nonPayingControl = this.majorEventForm.controls.shouldIssueCertificateForNonPayingAttendees;
    const nonSubscribedControl = this.majorEventForm.controls.shouldIssueCertificateForNonSubscribedAttendees;
    if (this.majorEventForm.controls.isPaymentRequired.value) {
      nonPayingControl.setValue(false, { emitEvent: false });
      nonPayingControl.disable({ emitEvent: false });
      nonSubscribedControl.enable({ emitEvent: false });
      return;
    }

    nonPayingControl.enable({ emitEvent: false });
    nonSubscribedControl.enable({ emitEvent: false });
  }
}
