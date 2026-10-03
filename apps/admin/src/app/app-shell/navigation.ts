import { type WorkspacePermissionTab } from '@cacic-fct/shared-permissions';

type NavigationLink = {
  kind: 'link';
  id: WorkspacePermissionTab;
  path: string;
  label: string;
  description: string;
  icon: string;
  group: string;
  helpLink: string | undefined;
  contextOnly?: true;
  visibleFor?: 'super-admin';
  requiredRoleLabel?: string;
};

type NavigationDivider = {
  kind: 'divider';
  id: string;
  label: string;
};

export type NavigationItem = NavigationLink | NavigationDivider;

export const navigationItems = [
  {
    kind: 'link',
    id: 'dashboard',
    path: '',
    label: 'Painel',
    description: 'Acompanhe filas operacionais, eventos próximos e alertas do workspace.',
    icon: 'dashboard',
    group: 'Visão geral',
    helpLink: undefined,
  },
  {
    kind: 'divider',
    id: 'divider-dashboard-events',
    label: 'Eventos',
  },
  {
    kind: 'link',
    id: 'events',
    path: 'events',
    label: 'Eventos',
    description: 'Gerencie eventos, datas, inscrições e locais.',
    icon: 'event',
    group: 'Estrutura do evento',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Gerenciar%20Eventos/Criar%20um%20evento',
  },
  {
    kind: 'link',
    id: 'groups',
    contextOnly: true,
    path: 'groups',
    label: 'Grupos de eventos',
    description: 'Gerencie agrupamentos de eventos e suas relações.',
    icon: 'folder',
    group: 'Estrutura do evento',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Gerenciar%20Eventos/Criar%20um%20grupo%20de%20eventos',
  },
  {
    kind: 'link',
    id: 'major-events',
    contextOnly: true,
    path: 'major-events',
    label: 'Grandes eventos',
    description: 'Organize eventos maiores compostos por várias atividades.',
    icon: 'festival',
    group: 'Estrutura do evento',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Gerenciar%20Eventos/Criar%20um%20grande%20evento',
  },
  {
    kind: 'link',
    id: 'sports',
    contextOnly: true,
    path: 'sports',
    label: 'Esportes',
    description: 'Organize torneios, equipes, tabelas, partidas e revisões esportivas.',
    icon: 'sports',
    group: 'Estrutura do evento',
    helpLink: undefined,
  },
  {
    kind: 'link',
    id: 'publication',
    contextOnly: true,
    path: 'publication',
    label: 'Publicação',
    description: 'Orquestre rascunhos, agendamentos, publicação e pré-visualizações.',
    icon: 'campaign',
    group: 'Estrutura do evento',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Publica%C3%A7%C3%A3o',
  },
  {
    kind: 'divider',
    id: 'divider-events-participation',
    label: 'Ferramentas globais',
  },
  {
    kind: 'link',
    id: 'subscriptions',
    contextOnly: true,
    path: 'subscriptions',
    label: 'Inscrições',
    description: 'Consulte e ajuste inscrições em eventos e grandes eventos.',
    icon: 'how_to_reg',
    group: 'Participação',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Inscrições',
  },
  {
    kind: 'link',
    id: 'attendances',
    contextOnly: true,
    path: 'attendances',
    label: 'Presenças',
    description: 'Controle presença, check-ins e registros de participação.',
    icon: 'fact_check',
    group: 'Participação',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Presenças',
  },
  {
    kind: 'link',
    id: 'certificates',
    path: 'certificates',
    label: 'Certificados avulsos',
    description: 'Organize pastas e emita certificados sem vínculo com eventos.',
    icon: 'workspace_premium',
    group: 'Participação',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Certificados',
  },
  {
    kind: 'link',
    id: 'forms',
    contextOnly: true,
    path: 'forms',
    label: 'Formulários',
    description: 'Crie formulários, vincule a eventos e acompanhe respostas.',
    icon: 'list_alt',
    group: 'Participação',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Formul%C3%A1rios',
  },
  {
    kind: 'link',
    id: 'prize-draws',
    contextOnly: true,
    path: 'draws',
    label: 'Sorteios',
    description: 'Configure, execute e audite sorteios vinculados a eventos.',
    icon: 'rewarded_ads',
    group: 'Participação',
    helpLink: undefined,
  },
  {
    kind: 'divider',
    id: 'divider-participation-people',
    label: 'Pessoas',
  },
  {
    kind: 'link',
    id: 'people',
    path: 'people',
    label: 'Pessoas',
    description: 'Consulte e gerencie participantes, palestrantes e usuários.',
    icon: 'groups',
    group: 'Pessoas',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Gerenciar%20pessoas/Painel%20de%20pessoas',
  },
  {
    kind: 'link',
    id: 'merge-candidates',
    path: 'merge-candidates',
    label: 'Pessoas duplicadas',
    description: 'Analise possíveis duplicidades e consolide registros.',
    icon: 'merge_type',
    group: 'Pessoas',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Gerenciar%20pessoas/Mesclar%20pessoas',
  },
  {
    kind: 'divider',
    id: 'divider-people-admin',
    label: 'Administração',
  },
  {
    kind: 'link',
    id: 'notifications',
    path: 'notifications',
    label: 'Notificações',
    description: 'Acompanhe avisos e preferências de comunicação.',
    icon: 'notifications',
    group: 'Administração',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Notificações',
  },
  {
    kind: 'link',
    id: 'places',
    path: 'places',
    label: 'Locais',
    description: 'Cadastre locais para reutilizar nos eventos.',
    icon: 'place',
    group: 'Administração',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Locais',
  },
  {
    kind: 'link',
    id: 'global-operations',
    path: 'global-operations',
    label: 'Operações globais',
    description: 'Execute ações administrativas com efeitos amplos.',
    icon: 'language',
    group: 'Administração',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Operações%20globais',
  },
  {
    kind: 'link',
    id: 'permissions',
    path: 'permissions',
    label: 'Permissões',
    description: 'Consulte seus acessos e administre cargos, pessoas e grupos.',
    icon: 'admin_panel_settings',
    group: 'Administração',
    helpLink:
      'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Permissões%20e%20recursos%20congelados',
  },
  {
    kind: 'link',
    id: 'audit-logs',
    path: 'audit-logs',
    label: 'Auditoria',
    description: 'Explore logs de auditoria de todo o sistema.',
    icon: 'manage_search',
    group: 'Administração',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Auditoria',
    visibleFor: 'super-admin',
    requiredRoleLabel: 'super-admin',
  },
  {
    kind: 'link',
    id: 'preferences',
    path: 'preferences',
    label: 'Preferências',
    description: 'Ajuste preferências administrativas da sua conta.',
    icon: 'settings',
    group: 'Administração',
    helpLink: 'https://docs.eventos.cacic.com.br/Manual/Interface%20administrativa/Prefer%C3%AAncias',
  },
] as const satisfies readonly NavigationItem[];

export const globalNavigationItems = navigationItems.filter((item) => !('contextOnly' in item));

export type NavigationLinkItem = Extract<(typeof navigationItems)[number], { kind: 'link' }>;
export type NavigationLinkId = NavigationLinkItem['id'];

export const navigationLinkItems = navigationItems.filter((item): item is NavigationLinkItem => item.kind === 'link');

export function findNavigationItemForUrl(rawUrl: string): NavigationLinkItem {
  const url = rawUrl.split('?')[0].split('#')[0];
  const segments = url.split('/').filter(Boolean);

  const workspaceIndex = segments.indexOf('event-workspace');
  const kind = segments[workspaceIndex + (segments[workspaceIndex + 1] === 'new' ? 2 : 1)];
  const workspaceTab = kind === 'group' ? 'groups' : kind === 'major-event' ? 'major-events' : 'events';
  return (
    (workspaceIndex >= 0 ? navigationLinkItems.find((item) => item.id === workspaceTab) : undefined) ??
    navigationLinkItems.find((item) => item.path === '' && segments.length === 0) ??
    navigationLinkItems.find((item) => item.path !== '' && segments.includes(item.path)) ??
    navigationLinkItems[0]
  );
}
