export type PeoplePresenceFilter = 'ALL' | 'YES' | 'NO';

export const PEOPLE_PRESENCE_FILTERS = [
  { key: 'hasUser', label: 'Conta vinculada', yes: 'Com conta', no: 'Sem conta' },
  { key: 'hasLecturerProfile', label: 'Perfil de ministrante', yes: 'Com perfil', no: 'Sem perfil' },
  { key: 'lecturerSelfEditingBlocked', label: 'Edição pelo ministrante', yes: 'Bloqueada', no: 'Permitida' },
  { key: 'hasEmail', label: 'E-mail principal', yes: 'Com e-mail', no: 'Sem e-mail' },
  { key: 'hasPhone', label: 'Telefone', yes: 'Com telefone', no: 'Sem telefone' },
  { key: 'hasIdentityDocument', label: 'Documento', yes: 'Com documento', no: 'Sem documento' },
  { key: 'hasAcademicId', label: 'Registro acadêmico (RA)', yes: 'Com RA', no: 'Sem RA' },
] as const;
