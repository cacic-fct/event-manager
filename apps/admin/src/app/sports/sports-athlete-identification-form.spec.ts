import { FormBuilder } from '@angular/forms';
import { createSportsWorkspaceForms } from './sports-workspace.forms';

describe('sports athlete identification fields', () => {
  it('defaults to shirt numbers and validates joining instructions length', () => {
    const form = createSportsWorkspaceForms(new FormBuilder()).category;

    expect(form.controls.athleteIdentifierMode.value).toBe('SHIRT_NUMBER');
    expect(form.controls.joiningInstructions.valid).toBe(true);

    form.controls.joiningInstructions.setValue('a'.repeat(4_001));
    expect(form.controls.joiningInstructions.hasError('maxlength')).toBe(true);
  });
});
