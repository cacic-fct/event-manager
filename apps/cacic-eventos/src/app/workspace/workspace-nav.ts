import { WorkspacePermissionTab } from '../shared/services/workspace-permissions.service';

export type WorkspaceNavItem = {
  id: string;
  path: string;
  label: string;
  description: string;
  icon: string;
  permissionTab: WorkspacePermissionTab;
  helpLink: string;
};

export const workspaceNavItems = [
  {
    id: 'events',
    path: 'events',
    label: 'Eventos',
    description: 'Gerencie eventos individuais, datas, locais e inscrições.',
    icon: 'event',
    permissionTab: WorkspacePermissionTab.Events,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'groups',
    path: 'groups',
    label: 'Grupos',
    description: 'Gerencie agrupamentos de eventos e suas relações.',
    icon: 'folder',
    permissionTab: WorkspacePermissionTab.Groups,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'major-events',
    path: 'major-events',
    label: 'Grandes eventos',
    description: 'Organize eventos maiores compostos por várias atividades.',
    icon: 'festival',
    permissionTab: WorkspacePermissionTab.MajorEvents,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'people',
    path: 'people',
    label: 'Pessoas',
    description: 'Consulte e gerencie participantes, palestrantes e usuários.',
    icon: 'groups',
    permissionTab: WorkspacePermissionTab.People,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'merge-candidates',
    path: 'merge-candidates',
    label: 'Pessoas duplicadas',
    description: 'Analise possíveis duplicidades e consolide registros.',
    icon: 'merge_type',
    permissionTab: WorkspacePermissionTab.MergeCandidates,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'certificates',
    path: 'certificates',
    label: 'Certificados',
    description: 'Gerencie modelos, emissões e validações de certificados.',
    icon: 'workspace_premium',
    permissionTab: WorkspacePermissionTab.Certificates,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'attendances',
    path: 'attendances',
    label: 'Presenças',
    description: 'Controle presença, check-ins e registros de participação.',
    icon: 'fact_check',
    permissionTab: WorkspacePermissionTab.Attendances,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'subscriptions',
    path: 'subscriptions',
    label: 'Inscrições',
    description: 'Consulte e ajuste inscrições em eventos e grandes eventos.',
    icon: 'how_to_reg',
    permissionTab: WorkspacePermissionTab.Subscriptions,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'notifications',
    path: 'notifications',
    label: 'Notificações',
    description: 'Acompanhe avisos e preferências de comunicação.',
    icon: 'notifications',
    permissionTab: WorkspacePermissionTab.Notifications,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'global-operations',
    path: 'global-operations',
    label: 'Operações globais',
    description: 'Execute ações administrativas com efeitos amplos.',
    icon: 'language',
    permissionTab: WorkspacePermissionTab.GlobalOperations,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
  {
    id: 'permissions',
    path: 'permissions',
    label: 'Permissões',
    description: 'Consulte os acessos concedidos para este usuário.',
    icon: 'admin_panel_settings',
    permissionTab: WorkspacePermissionTab.Permissions,
    helpLink: 'https://docs.fctapp.cacic.dev.br/',
  },
] as const satisfies readonly WorkspaceNavItem[];
