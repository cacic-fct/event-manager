import { isValidCPF, maskCPF } from '@cacic-fct/shared-utils';
import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function isCpfFormattedDocument(value: string): boolean {
  const normalized = value.trim();
  return /^[\d.\-\s]+$/.test(normalized) && normalized.replace(/\D/g, '').length === 11;
}

export function ticketIdentityDocumentValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value || !isCpfFormattedDocument(value)) return null;
  return isValidCPF(value.replace(/\D/g, '')) ? null : { invalidCpf: true };
}

export const ticketDocumentValidator: ValidatorFn = ticketIdentityDocumentValidator;

export function normalizeTicketIdentityDocument(value: string): string {
  const normalized = value.trim();
  return isCpfFormattedDocument(normalized) ? normalized.replace(/\D/g, '') : normalized;
}

export function redactIdentityDocument(value: string | null | undefined): string {
  if (!value?.trim()) return 'Documento não informado';
  const normalized = value.trim();
  if (!isCpfFormattedDocument(normalized)) return normalized;

  return maskCPF(normalized);
}
