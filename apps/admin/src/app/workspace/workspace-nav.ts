import { type WorkspacePermissionTab } from '@cacic-fct/shared-permissions';

type WorkspaceNavLink = {
  kind: 'link';
  id: WorkspacePermissionTab;
  path: string;
  label: string;
  description: string;
  icon: string;
  helpLink: string;
};

type WorkspaceNavDivider = {
  kind: 'divider';
  id: string;
};

export type WorkspaceNavItem = WorkspaceNavLink | WorkspaceNavDivider;

export const workspaceNavItems = [
  {
    kind: 'link',
    id: 'events',
    path: 'events',
    label: 'Eventos',
    description: 'Gerencie eventos individuais, datas, locais e inscrições.',
    icon: 'event',
    helpLink: 'https://docs.fctapp.cacic.dev.br/Manual/Gerenciar%20Eventos/Criar%20um%20evento',
  },
  {
    kind: 'link',
    id: 'groups',
    path: 'groups',
    label: 'Grupos',
    description: 'Gerencie agrupamentos de eventos e suas relações.',
    icon: 'folder',
    helpLink: 'https://docs.fctapp.cacic.dev.br/Manual/Gerenciar%20Eventos/Criar%20um%20grupo%20de%20eventos',
  },
  {
    kind: 'link',
    id: 'major-events',
    path: 'major-events',
    label: 'Grandes eventos',
    description: 'Organize eventos maiores compostos por várias atividades.',
    icon: 'festival',
    helpLink: 'https://docs.fctapp.cacic.dev.br/Manual/Gerenciar%20Eventos/Criar%20um%20grande%20evento',
  },
  {
    kind: 'link',
    id: 'publication',
    path: 'publication',
    label: 'Publicação',
    description: 'Orquestre rascunhos, agendamentos, publicação e pré-visualizações.',
    icon: 'campaign',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'divider',
    id: 'divider-events-participation',
  },
  {
    kind: 'link',
    id: 'subscriptions',
    path: 'subscriptions',
    label: 'Inscrições',
    description: 'Consulte e ajuste inscrições em eventos e grandes eventos.',
    icon: 'how_to_reg',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'attendances',
    path: 'attendances',
    label: 'Presenças',
    description: 'Controle presença, check-ins e registros de participação.',
    icon: 'fact_check',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'certificates',
    path: 'certificates',
    label: 'Certificados',
    description: 'Gerencie modelos, emissões e validações de certificados.',
    icon: 'workspace_premium',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'divider',
    id: 'divider-participation-people',
  },
  {
    kind: 'link',
    id: 'people',
    path: 'people',
    label: 'Pessoas',
    description: 'Consulte e gerencie participantes, palestrantes e usuários.',
    icon: 'groups',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'merge-candidates',
    path: 'merge-candidates',
    label: 'Pessoas duplicadas',
    description: 'Analise possíveis duplicidades e consolide registros.',
    icon: 'merge_type',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'divider',
    id: 'divider-people-admin',
  },
  {
    kind: 'link',
    id: 'notifications',
    path: 'notifications',
    label: 'Notificações',
    description: 'Acompanhe avisos e preferências de comunicação.',
    icon: 'notifications',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'places',
    path: 'places',
    label: 'Locais',
    description: 'Gerencie presets de locais usados nos eventos.',
    icon: 'place',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'global-operations',
    path: 'global-operations',
    label: 'Operações globais',
    description: 'Execute ações administrativas com efeitos amplos.',
    icon: 'language',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'permissions',
    path: 'permissions',
    label: 'Permissões',
    description: 'Consulte os acessos concedidos para este usuário.',
    icon: 'admin_panel_settings',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    kind: 'link',
    id: 'preferences',
    path: 'preferences',
    label: 'Preferências',
    description: 'Ajuste preferências administrativas da sua conta.',
    icon: 'settings',
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
] as const satisfies readonly WorkspaceNavItem[];

export type WorkspaceNavLinkItem = Extract<(typeof workspaceNavItems)[number], { kind: 'link' }>;
export type WorkspaceNavLinkId = WorkspaceNavLinkItem['id'];

export const workspaceNavLinkItems = workspaceNavItems.filter(
  (item): item is WorkspaceNavLinkItem => item.kind === 'link',
);

export function findWorkspaceNavItemForUrl(rawUrl: string): WorkspaceNavLinkItem {
  const url = rawUrl.split('?')[0].split('#')[0];
  const segments = url.split('/').filter(Boolean);

  return workspaceNavLinkItems.find((item) => segments.includes(item.path)) ?? workspaceNavLinkItems[0];
}
