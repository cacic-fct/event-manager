import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

export function createTeamOperationsForms() {
  return {
    profile: new FormGroup({
      name: new FormControl('', { nonNullable: true, validators: Validators.required }),
      institution: new FormControl('', { nonNullable: true }),
    }),
    identity: new FormGroup({
      type: new FormControl<'IDENTITY_DOCUMENT' | 'PHONE' | 'EMAIL'>('EMAIL', { nonNullable: true }),
      value: new FormControl('', { nonNullable: true, validators: Validators.required }),
    }),
    lineup: new FormGroup({
      matchId: new FormControl('', { nonNullable: true, validators: Validators.required }),
      registrationId: new FormControl('', { nonNullable: true, validators: Validators.required }),
      expectedRevision: new FormControl<number | null>(null),
      memberIds: new FormArray<FormControl<string>>([]),
    }),
  };
}
