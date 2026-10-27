import type { Provider } from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS, type MatFormFieldDefaultOptions } from '@angular/material/form-field';

// Wrapped hints and validation messages must reserve their full height before
// the next control, including in narrow sidebar forms and dialogs.
export const adminFormFieldDefaultsProvider: Provider = {
  provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
  useValue: { subscriptSizing: 'dynamic' } satisfies MatFormFieldDefaultOptions,
};
