import { normalizeTransferPhone } from './person-phone';
import type { TransferPersonData } from './models';

/** Shared by the confirmation form and the server; database identity checks remain server-side. */
export function transferPersonDataError(
  data: TransferPersonData,
  requireAdditionalIdentifier = true,
): string | undefined {
  for (const [field, value] of Object.entries(data)) {
    if (value && value.length > (field === 'name' || field === 'email' ? 300 : 40))
      return 'Um campo excede o limite de caracteres. Reduza o conteúdo antes de confirmar.';
  }
  if (!data.name?.trim() || data.name.trim().split(/\s+/).length < 2) return 'Informe o nome completo.';
  if (data.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    return 'Informe um e-mail válido ou remova esse campo.';
  const phone = data.phone?.trim() ? normalizeTransferPhone(data.phone) : undefined;
  if (data.phone?.trim() && !phone)
    return 'Informe um telefone completo com código do país, como +5518912345678, ou um número brasileiro com DDD.';
  if (
    requireAdditionalIdentifier &&
    !data.academicId?.trim() &&
    !data.identityDocument?.replace(/[^A-Za-z0-9]/g, '') &&
    !data.email?.trim() &&
    !phone
  )
    return 'Além do nome completo, informe matrícula, documento, e-mail ou telefone completo.';
  return undefined;
}
