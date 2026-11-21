const DOMAIN_LABELS: Record<string, string> = {
  analytics: 'Métricas',
  'content-review': 'Revisão de conteúdo',
  'event-context': 'Estrutura',
  users: 'Contas',
  dashboard: 'Painel',
  publishing: 'Publicação',
  'ticket-purchases': 'Compras',
  certificate: 'Certificados',
  places: 'Locais',
  'audit-log': 'Auditoria',
  tickets: 'Bilhetes',
  'event-forms': 'Formulários',
  sports: 'Esportes',
  interests: 'Interesses',
  'major-events': 'Grandes eventos',
  'prize-draw': 'Sorteios',
  people: 'Pessoas',
  'major-event-receipts': 'Comprovantes',
  authorization: 'Permissões',
  'event-groups': 'Grupos de eventos',
  events: 'Eventos',
};

const ARGUMENT_LABELS: Record<string, string> = {
  id: 'Identificador',
  input: 'Dados da operação',
  data: 'Dados',
  name: 'Nome',
  description: 'Descrição',
  eventId: 'Evento',
  eventGroupId: 'Grupo de eventos',
  groupId: 'Grupo',
  majorEventId: 'Grande evento',
  personId: 'Pessoa',
  personIds: 'Pessoas',
  userId: 'Conta',
  userIds: 'Contas',
  matchId: 'Partida',
  tournamentId: 'Torneio',
  teamId: 'Equipe',
  formId: 'Formulário',
  subscriptionId: 'Inscrição',
  certificateId: 'Certificado',
  folderId: 'Pasta',
  placeId: 'Local',
  startDate: 'Data de início',
  endDate: 'Data de término',
  score: 'Pontuação',
  notes: 'Observações',
};

export function adminOperationDomainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] ?? domain;
}

export function adminOperationArgumentLabel(key: string): string {
  return ARGUMENT_LABELS[key] ?? key;
}

export function normalizeOperationSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}
