import { Injectable, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventFormStateService {
  private readonly formBuilder = inject(FormBuilder);

  createEventFiltersForm() {
    return this.formBuilder.nonNullable.group({
      startDateFrom: [''],
      startDateUntil: [''],
      isInGroup: ['ALL'],
      isInMajorEvent: ['ALL'],
      query: [''],
    });
  }

  createEventForm() {
    return this.formBuilder.nonNullable.group(
      {
        id: [''],
        name: ['', [Validators.required]],
        creditDisplayMode: ['hours'],
        creditValue: this.formBuilder.control<number | string | null>(null, [Validators.min(0)]),
        startDate: ['', [Validators.required]],
        endDate: ['', [Validators.required]],
        emoji: ['', [Validators.required]],
        type: ['OTHER', [Validators.required]],
        description: [''],
        shortDescription: [''],
        latitude: [''],
        longitude: [''],
        locationDescription: [''],
        locationPresetId: ['PERSONALIZADO'],
        majorEventId: [''],
        eventGroupId: [''],
        allowSubscription: [false],
        subscriptionStartDate: [''],
        subscriptionEndDate: [''],
        slots: [''],
        autoSubscribe: [false],
        shouldIssueCertificate: [false],
        shouldIssueCertificateForNonPayingAttendees: [false],
        shouldIssueCertificateForNonSubscribedAttendees: [false],
        shouldCollectAttendance: [false],
        isOnlineAttendanceAllowed: [false],
        shouldProvideSubscriberListToLecturer: [false],
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
  }

  createLookupForm(required = false) {
    if (required) {
      return this.formBuilder.nonNullable.group({
        query: ['', [Validators.required]],
      });
    }

    return this.formBuilder.nonNullable.group({
      query: [''],
    });
  }

  syncOnlineAttendanceControls(eventForm: ReturnType<WorkspaceEventFormStateService['createEventForm']>): void {
    const onlineControls = [
      eventForm.controls.onlineAttendanceCode,
      eventForm.controls.onlineAttendanceStartDate,
      eventForm.controls.onlineAttendanceEndDate,
    ];
    const shouldEnable = eventForm.controls.isOnlineAttendanceAllowed.value;

    for (const control of onlineControls) {
      if (shouldEnable) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
      }
    }
  }

  syncCertificateControls(
    eventForm: ReturnType<WorkspaceEventFormStateService['createEventForm']>,
    groupAllowsCertificates: boolean | null,
    groupAllowsNonPayingCertificates: boolean | null,
    groupAllowsNonSubscribedCertificates: boolean | null,
  ): void {
    const certificateControl = eventForm.controls.shouldIssueCertificate;
    const nonPayingCertificateControl = eventForm.controls.shouldIssueCertificateForNonPayingAttendees;
    const nonSubscribedCertificateControl = eventForm.controls.shouldIssueCertificateForNonSubscribedAttendees;
    if (groupAllowsCertificates === false) {
      certificateControl.setValue(false, { emitEvent: false });
      nonPayingCertificateControl.setValue(false, { emitEvent: false });
      nonSubscribedCertificateControl.setValue(false, { emitEvent: false });
      certificateControl.disable({ emitEvent: false });
      nonPayingCertificateControl.disable({ emitEvent: false });
      nonSubscribedCertificateControl.disable({ emitEvent: false });
      return;
    }

    certificateControl.enable({ emitEvent: false });
    if (certificateControl.value && groupAllowsNonPayingCertificates !== false) {
      nonPayingCertificateControl.enable({ emitEvent: false });
    } else {
      nonPayingCertificateControl.setValue(false, { emitEvent: false });
      nonPayingCertificateControl.disable({ emitEvent: false });
    }

    if (certificateControl.value && groupAllowsNonSubscribedCertificates !== false) {
      nonSubscribedCertificateControl.enable({ emitEvent: false });
      return;
    }

    nonSubscribedCertificateControl.setValue(false, { emitEvent: false });
    nonSubscribedCertificateControl.disable({ emitEvent: false });
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
