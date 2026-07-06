import { EVENT_MANAGER_PERMISSION_CATALOG } from './permission-catalog';
import { Permission, type PermissionRequirement } from './permission-types';

export const WorkspacePermissionTab = {
  Dashboard: 'dashboard',
  Events: 'events',
  MajorEvents: 'major-events',
  Groups: 'groups',
  Forms: 'forms',
  Publication: 'publication',
  People: 'people',
  MergeCandidates: 'merge-candidates',
  Certificates: 'certificates',
  Attendances: 'attendances',
  Subscriptions: 'subscriptions',
  Places: 'places',
  GlobalOperations: 'global-operations',
  Permissions: 'permissions',
  AuditLogs: 'audit-logs',
  Notifications: 'notifications',
  Preferences: 'preferences',
} as const;

export type WorkspacePermissionTab = (typeof WorkspacePermissionTab)[keyof typeof WorkspacePermissionTab];

export type WorkspaceTabPermission = {
  id: WorkspacePermissionTab;
  label: string;
  read: PermissionRequirement;
  edit: PermissionRequirement;
  delete: PermissionRequirement;
};

export const WORKSPACE_ENTRY_PERMISSIONS = [
  Permission.Certificate.Read,
  Permission.CertificateConfig.Read,
  Permission.Event.Read,
  Permission.EventAttendance.Read,
  Permission.EventAttendanceCollector.Read,
  Permission.EventGroup.Read,
  Permission.EventLecturer.Read,
  Permission.EventForm.Read,
  Permission.MajorEvent.Read,
  Permission.MergeCandidate.Read,
  Permission.Person.Read,
  Permission.PlacePreset.Read,
  Permission.Receipt.Read,
  Permission.Subscription.Read,
  Permission.User.Read,
] as const satisfies PermissionRequirement;

export const WORKSPACE_TAB_PERMISSIONS = [
  {
    id: WorkspacePermissionTab.Dashboard,
    label: 'Painel',
    read: [],
    edit: [],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.Events,
    label: 'Eventos',
    read: [
      Permission.Event.Read,
      Permission.MajorEvent.Read,
      Permission.EventLecturer.Read,
      Permission.EventAttendanceCollector.Read,
    ],
    edit: [
      Permission.Event.Create,
      Permission.Event.Update,
      Permission.EventLecturer.Create,
      Permission.EventLecturer.Update,
      Permission.EventAttendanceCollector.Create,
      Permission.Person.Create,
      Permission.Person.Update,
    ],
    delete: [Permission.Event.Delete, Permission.EventLecturer.Delete, Permission.EventAttendanceCollector.Delete],
  },
  {
    id: WorkspacePermissionTab.MajorEvents,
    label: 'Grandes eventos',
    read: [Permission.MajorEvent.Read, Permission.Event.Read],
    edit: [Permission.MajorEvent.Create, Permission.MajorEvent.Update, Permission.Event.Update],
    delete: [Permission.MajorEvent.Delete],
  },
  {
    id: WorkspacePermissionTab.Groups,
    label: 'Grupos',
    read: [Permission.EventGroup.Read],
    edit: [Permission.EventGroup.Create, Permission.EventGroup.Update],
    delete: [Permission.EventGroup.Delete],
  },
  {
    id: WorkspacePermissionTab.Publication,
    label: 'Publicação',
    read: [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read],
    edit: [Permission.Event.Update, Permission.EventGroup.Update, Permission.MajorEvent.Update],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.Forms,
    label: 'Formulários',
    read: [Permission.EventForm.Read, Permission.Event.Read, Permission.MajorEvent.Read],
    edit: [
      Permission.EventForm.Create,
      Permission.EventForm.Update,
      Permission.EventForm.Publish,
      Permission.Event.Update,
      Permission.MajorEvent.Update,
    ],
    delete: [Permission.EventForm.Delete],
  },
  {
    id: WorkspacePermissionTab.People,
    label: 'Pessoas',
    read: [Permission.Person.Read],
    edit: [Permission.Person.Create, Permission.Person.Update],
    delete: [Permission.Person.Delete],
  },
  {
    id: WorkspacePermissionTab.MergeCandidates,
    label: 'Pessoas duplicadas',
    read: [Permission.MergeCandidate.Read, Permission.Person.Read],
    edit: [
      Permission.MergeCandidate.Create,
      Permission.MergeCandidate.Update,
      Permission.MergeCandidate.Scan,
      Permission.MergeCandidate.Merge,
      Permission.MergeCandidate.Undo,
      Permission.Person.Update,
    ],
    delete: [Permission.MergeCandidate.Delete],
  },
  {
    id: WorkspacePermissionTab.Certificates,
    label: 'Certificados',
    read: [
      Permission.Certificate.Read,
      Permission.CertificateConfig.Read,
      Permission.Event.Read,
      Permission.EventGroup.Read,
      Permission.MajorEvent.Read,
    ],
    edit: [
      Permission.Certificate.Issue,
      Permission.Certificate.Reissue,
      Permission.CertificateConfig.Create,
      Permission.CertificateConfig.Update,
    ],
    delete: [Permission.Certificate.Delete, Permission.CertificateConfig.Delete],
  },
  {
    id: WorkspacePermissionTab.Attendances,
    label: 'Presenças',
    read: [Permission.EventAttendance.Read, Permission.Event.Read, Permission.MajorEvent.Read],
    edit: [Permission.EventAttendance.Collect, Permission.EventAttendance.Import, Permission.EventAttendance.Update],
    delete: [Permission.EventAttendance.Delete],
  },
  {
    id: WorkspacePermissionTab.Subscriptions,
    label: 'Inscrições',
    read: [Permission.Subscription.Read, Permission.Event.Read, Permission.MajorEvent.Read],
    edit: [
      Permission.Subscription.Create,
      Permission.Subscription.Update,
      Permission.Subscription.Import,
      Permission.Receipt.Approve,
      Permission.Receipt.Reject,
      Permission.Receipt.Undo,
    ],
    delete: [Permission.Subscription.Delete],
  },
  {
    id: WorkspacePermissionTab.Places,
    label: 'Locais',
    read: [Permission.PlacePreset.Read],
    edit: [Permission.PlacePreset.Create, Permission.PlacePreset.Update, Permission.PlacePreset.Merge],
    delete: [Permission.PlacePreset.Delete],
  },
  {
    id: WorkspacePermissionTab.GlobalOperations,
    label: 'Operações globais',
    read: [Permission.Certificate.Read],
    edit: [Permission.Certificate.Reissue, Permission.Frozen.Update],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.Permissions,
    label: 'Permissões',
    read: [Permission.PermissionGrant.Read, Permission.Person.Read],
    edit: [
      Permission.PermissionGrant.Create,
      Permission.PermissionGrant.Update,
      Permission.PermissionGrant.Delete,
      Permission.Person.Read,
    ],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.AuditLogs,
    label: 'Auditoria',
    read: [],
    edit: [],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.Notifications,
    label: 'Notificações',
    read: [],
    edit: [],
    delete: [],
  },
  {
    id: WorkspacePermissionTab.Preferences,
    label: 'Preferências',
    read: [],
    edit: [],
    delete: [],
  },
] as const satisfies readonly WorkspaceTabPermission[];

export const WORKSPACE_PERMISSION_EVALUATION_SET = EVENT_MANAGER_PERMISSION_CATALOG;
