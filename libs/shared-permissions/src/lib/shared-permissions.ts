export const Permission = {
  Certificate: {
    Read: 'certificate#read',
    Issue: 'certificate#issue',
    Reissue: 'certificate#reissue',
    Delete: 'certificate#delete',
  },
  CertificateConfig: {
    Read: 'certificate-config#read',
    Create: 'certificate-config#create',
    Update: 'certificate-config#update',
    Delete: 'certificate-config#delete',
  },
  Event: {
    Read: 'event#read',
    Create: 'event#create',
    Update: 'event#update',
    Delete: 'event#delete',
  },
  EventAttendance: {
    Read: 'event-attendance#read',
    Collect: 'event-attendance#collect',
    Import: 'event-attendance#import',
    Update: 'event-attendance#update',
    Delete: 'event-attendance#delete',
  },
  EventAttendanceCollector: {
    Read: 'event-attendance-collector#read',
    Create: 'event-attendance-collector#create',
    Delete: 'event-attendance-collector#delete',
  },
  EventGroup: {
    Read: 'event-group#read',
    Create: 'event-group#create',
    Update: 'event-group#update',
    Delete: 'event-group#delete',
  },
  EventLecturer: {
    Read: 'event-lecturer#read',
    Create: 'event-lecturer#create',
    Update: 'event-lecturer#update',
    Delete: 'event-lecturer#delete',
  },
  Frozen: {
    Update: 'frozen#update',
    Delete: 'frozen#delete',
  },
  MajorEvent: {
    Read: 'major-event#read',
    Create: 'major-event#create',
    Update: 'major-event#update',
    Delete: 'major-event#delete',
  },
  MergeCandidate: {
    Read: 'merge-candidate#read',
    Create: 'merge-candidate#create',
    Update: 'merge-candidate#update',
    Scan: 'merge-candidate#scan',
    Merge: 'merge-candidate#merge',
    Undo: 'merge-candidate#undo',
    Delete: 'merge-candidate#delete',
  },
  Person: {
    Read: 'person#read',
    Create: 'person#create',
    Update: 'person#update',
    Delete: 'person#delete',
  },
  PermissionGrant: {
    Read: 'permission-grant#read',
    Create: 'permission-grant#create',
    Update: 'permission-grant#update',
    Delete: 'permission-grant#delete',
  },
  PlacePreset: {
    Read: 'place-preset#read',
    Create: 'place-preset#create',
    Update: 'place-preset#update',
    Merge: 'place-preset#merge',
    Delete: 'place-preset#delete',
  },
  Receipt: {
    Read: 'receipt#read',
    Approve: 'receipt#approve',
    Reject: 'receipt#reject',
    Undo: 'receipt#undo',
  },
  Subscription: {
    Read: 'subscription#read',
    Create: 'subscription#create',
    Update: 'subscription#update',
    Import: 'subscription#import',
    Delete: 'subscription#delete',
  },
  User: {
    Read: 'user#read',
  },
} as const;

type NestedPermissionValue<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? NestedPermissionValue<T[keyof T]>
    : never;

export type Permission = NestedPermissionValue<typeof Permission>;

export type PermissionRequirement = readonly Permission[];

export const EventManagerKeycloakRole = {
  Access: 'access',
  SuperAdmin: 'super-admin',
} as const;

export type EventManagerKeycloakRole =
  (typeof EventManagerKeycloakRole)[keyof typeof EventManagerKeycloakRole];

export const EventManagerPermissionGrantScope = {
  Global: 'GLOBAL',
  Event: 'EVENT',
  MajorEvent: 'MAJOR_EVENT',
  EventGroup: 'EVENT_GROUP',
} as const;

export type EventManagerPermissionGrantScope =
  (typeof EventManagerPermissionGrantScope)[keyof typeof EventManagerPermissionGrantScope];

export const EVENT_MANAGER_PERMISSION_CATALOG = [
  Permission.Certificate.Read,
  Permission.Certificate.Issue,
  Permission.Certificate.Reissue,
  Permission.Certificate.Delete,
  Permission.CertificateConfig.Read,
  Permission.CertificateConfig.Create,
  Permission.CertificateConfig.Update,
  Permission.CertificateConfig.Delete,
  Permission.Event.Read,
  Permission.Event.Create,
  Permission.Event.Update,
  Permission.Event.Delete,
  Permission.EventAttendance.Read,
  Permission.EventAttendance.Collect,
  Permission.EventAttendance.Import,
  Permission.EventAttendance.Update,
  Permission.EventAttendance.Delete,
  Permission.EventAttendanceCollector.Read,
  Permission.EventAttendanceCollector.Create,
  Permission.EventAttendanceCollector.Delete,
  Permission.EventGroup.Read,
  Permission.EventGroup.Create,
  Permission.EventGroup.Update,
  Permission.EventGroup.Delete,
  Permission.EventLecturer.Read,
  Permission.EventLecturer.Create,
  Permission.EventLecturer.Update,
  Permission.EventLecturer.Delete,
  Permission.Frozen.Update,
  Permission.Frozen.Delete,
  Permission.MajorEvent.Read,
  Permission.MajorEvent.Create,
  Permission.MajorEvent.Update,
  Permission.MajorEvent.Delete,
  Permission.MergeCandidate.Read,
  Permission.MergeCandidate.Create,
  Permission.MergeCandidate.Update,
  Permission.MergeCandidate.Scan,
  Permission.MergeCandidate.Merge,
  Permission.MergeCandidate.Undo,
  Permission.MergeCandidate.Delete,
  Permission.Person.Read,
  Permission.Person.Create,
  Permission.Person.Update,
  Permission.Person.Delete,
  Permission.PermissionGrant.Read,
  Permission.PermissionGrant.Create,
  Permission.PermissionGrant.Update,
  Permission.PermissionGrant.Delete,
  Permission.PlacePreset.Read,
  Permission.PlacePreset.Create,
  Permission.PlacePreset.Update,
  Permission.PlacePreset.Merge,
  Permission.PlacePreset.Delete,
  Permission.Receipt.Read,
  Permission.Receipt.Approve,
  Permission.Receipt.Reject,
  Permission.Receipt.Undo,
  Permission.Subscription.Read,
  Permission.Subscription.Create,
  Permission.Subscription.Update,
  Permission.Subscription.Import,
  Permission.Subscription.Delete,
  Permission.User.Read,
] as const satisfies PermissionRequirement;

export const EVENT_MANAGER_PERMISSION_SET = new Set<Permission>(EVENT_MANAGER_PERMISSION_CATALOG);

export type PermissionGroup = {
  type: string;
  label: string;
  resourceIcon: string;
  actions: {
    scope: string;
    label: string;
    icon: string;
  }[];
};

export type WorkspaceTabPermission = {
  label: string;
  read: PermissionRequirement;
  edit: PermissionRequirement;
  delete: PermissionRequirement;
};

export type PermissionIncludedData = {
  label: string;
  fields: readonly string[];
};

export const WORKSPACE_ENTRY_PERMISSIONS = [
  Permission.Certificate.Read,
  Permission.CertificateConfig.Read,
  Permission.Event.Read,
  Permission.EventAttendance.Read,
  Permission.EventAttendanceCollector.Read,
  Permission.EventGroup.Read,
  Permission.EventLecturer.Read,
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
    label: 'Eventos',
    read: [Permission.Event.Read, Permission.MajorEvent.Read, Permission.EventLecturer.Read],
    edit: [
      Permission.Event.Create,
      Permission.Event.Update,
      Permission.EventLecturer.Create,
      Permission.EventLecturer.Update,
      Permission.Person.Create,
      Permission.Person.Update,
    ],
    delete: [Permission.Event.Delete, Permission.EventLecturer.Delete],
  },
  {
    label: 'Grandes eventos',
    read: [Permission.MajorEvent.Read, Permission.Event.Read],
    edit: [Permission.MajorEvent.Create, Permission.MajorEvent.Update, Permission.Event.Update],
    delete: [Permission.MajorEvent.Delete],
  },
  {
    label: 'Grupos',
    read: [Permission.EventGroup.Read],
    edit: [Permission.EventGroup.Create, Permission.EventGroup.Update],
    delete: [Permission.EventGroup.Delete],
  },
  {
    label: 'Pessoas',
    read: [Permission.Person.Read],
    edit: [Permission.Person.Create, Permission.Person.Update],
    delete: [Permission.Person.Delete],
  },
  {
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
    label: 'Presenças',
    read: [Permission.EventAttendance.Read, Permission.Event.Read, Permission.MajorEvent.Read],
    edit: [Permission.EventAttendance.Collect, Permission.EventAttendance.Import, Permission.EventAttendance.Update],
    delete: [Permission.EventAttendance.Delete],
  },
  {
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
    label: 'Locais',
    read: [Permission.PlacePreset.Read],
    edit: [Permission.PlacePreset.Create, Permission.PlacePreset.Update, Permission.PlacePreset.Merge],
    delete: [Permission.PlacePreset.Delete],
  },
  {
    label: 'Operações globais',
    read: [Permission.Certificate.Read],
    edit: [Permission.Certificate.Reissue, Permission.Frozen.Update],
    delete: [],
  },
  {
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
    label: 'Notificações',
    read: [],
    edit: [],
    delete: [],
  },
] as const satisfies readonly WorkspaceTabPermission[];

export const WORKSPACE_PERMISSION_EVALUATION_SET = [
  ...WORKSPACE_ENTRY_PERMISSIONS,
  ...WORKSPACE_TAB_PERMISSIONS.flatMap((tab) => [...tab.read, ...tab.edit, ...tab.delete]),
  Permission.Frozen.Update,
  Permission.Frozen.Delete,
  Permission.PermissionGrant.Read,
  Permission.PermissionGrant.Create,
  Permission.PermissionGrant.Update,
  Permission.PermissionGrant.Delete,
  Permission.Receipt.Read,
] as const satisfies PermissionRequirement;

export const EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS = [
  Permission.MergeCandidate.Read,
  Permission.MergeCandidate.Create,
  Permission.MergeCandidate.Update,
  Permission.MergeCandidate.Scan,
  Permission.MergeCandidate.Merge,
  Permission.MergeCandidate.Undo,
  Permission.MergeCandidate.Delete,
  Permission.Person.Read,
  Permission.Person.Create,
  Permission.Person.Update,
  Permission.Person.Delete,
  Permission.PermissionGrant.Read,
  Permission.PermissionGrant.Create,
  Permission.PermissionGrant.Update,
  Permission.PermissionGrant.Delete,
  Permission.PlacePreset.Read,
  Permission.PlacePreset.Create,
  Permission.PlacePreset.Update,
  Permission.PlacePreset.Merge,
  Permission.PlacePreset.Delete,
  Permission.User.Read,
] as const satisfies PermissionRequirement;

export const EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSION_SET = new Set<Permission>(
  EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSIONS,
);

export function requiresGlobalPermissionGrantScope(permission: Permission): boolean {
  return EVENT_MANAGER_GLOBAL_ONLY_GRANT_PERMISSION_SET.has(permission);
}

const LIMITED_PERSON_IDENTITY = [
  'nome',
  'e-mail principal',
  'telefone',
  'documento',
  'ID acadêmico',
] as const;

const EVENT_CONTEXT_FIELDS = ['nome', 'datas', 'tipo', 'grupo', 'grande evento'] as const;

const SUBSCRIPTION_CONTEXT_FIELDS = [
  'status',
  'eventos selecionados',
  'valores e faixa de pagamento',
  'origem da inscrição',
] as const;

const RECEIPT_CONTEXT_FIELDS = [
  'imagem do comprovante',
  'texto OCR',
  'valor identificado',
  'nome identificado',
  'histórico de validação',
] as const;

export const EVENT_MANAGER_PERMISSION_INCLUDED_DATA: Readonly<
  Partial<Record<Permission, readonly PermissionIncludedData[]>>
> = {
  [Permission.EventLecturer.Read]: [
    {
      label: 'Dados limitados da pessoa ministrante',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto do evento',
      fields: EVENT_CONTEXT_FIELDS,
    },
  ],
  [Permission.EventLecturer.Create]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventLecturer.Update]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventLecturer.Delete]: [
    {
      label: 'Identificação da pessoa ministrante',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventAttendance.Read]: [
    {
      label: 'Dados limitados da pessoa presente',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto da presença',
      fields: ['evento', 'data da coleta', 'categoria', 'coletor'],
    },
  ],
  [Permission.EventAttendance.Collect]: [
    {
      label: 'Identificação mínima para coleta',
      fields: ['nome', 'código de usuário', 'documento', 'perfil Unesp'],
    },
    {
      label: 'Contexto de inscrição relacionado',
      fields: ['status da inscrição', 'eventos selecionados'],
    },
  ],
  [Permission.EventAttendance.Import]: [
    {
      label: 'Identificação para conciliação de importação',
      fields: ['nome', 'e-mail principal', 'documento', 'ID acadêmico'],
    },
    {
      label: 'Contexto de inscrição relacionado',
      fields: ['status da inscrição', 'eventos selecionados'],
    },
  ],
  [Permission.EventAttendance.Update]: [
    {
      label: 'Dados limitados da presença existente',
      fields: ['pessoa', 'evento', 'data da coleta', 'categoria'],
    },
  ],
  [Permission.EventAttendance.Delete]: [
    {
      label: 'Dados limitados da presença existente',
      fields: ['pessoa', 'evento', 'data da coleta'],
    },
  ],
  [Permission.EventAttendanceCollector.Read]: [
    {
      label: 'Dados limitados da pessoa coletora',
      fields: ['nome', 'e-mail principal', 'ID da pessoa'],
    },
    {
      label: 'Contexto do evento',
      fields: EVENT_CONTEXT_FIELDS,
    },
  ],
  [Permission.EventAttendanceCollector.Create]: [
    {
      label: 'Identificação da pessoa coletora',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.EventAttendanceCollector.Delete]: [
    {
      label: 'Identificação da pessoa coletora',
      fields: ['ID da pessoa', 'nome'],
    },
  ],
  [Permission.Subscription.Read]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto da inscrição',
      fields: SUBSCRIPTION_CONTEXT_FIELDS,
    },
  ],
  [Permission.Subscription.Create]: [
    {
      label: 'Identificação da pessoa inscrita',
      fields: ['ID da pessoa', 'nome', 'e-mail principal', 'documento'],
    },
    {
      label: 'Contexto de elegibilidade da inscrição',
      fields: ['evento', 'grande evento', 'vagas', 'ministrante vinculado'],
    },
  ],
  [Permission.Subscription.Update]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: LIMITED_PERSON_IDENTITY,
    },
    {
      label: 'Contexto de alteração da inscrição',
      fields: SUBSCRIPTION_CONTEXT_FIELDS,
    },
  ],
  [Permission.Subscription.Import]: [
    {
      label: 'Identificação para conciliação de importação',
      fields: ['nome', 'e-mail principal', 'documento', 'ID acadêmico'],
    },
    {
      label: 'Contexto de elegibilidade da inscrição',
      fields: ['evento', 'grande evento', 'vagas'],
    },
  ],
  [Permission.Subscription.Delete]: [
    {
      label: 'Dados limitados da inscrição existente',
      fields: ['pessoa', 'evento ou grande evento', 'status'],
    },
  ],
  [Permission.Receipt.Read]: [
    {
      label: 'Dados limitados da pessoa inscrita',
      fields: ['nome', 'e-mail principal', 'telefone'],
    },
    {
      label: 'Contexto de inscrição e comprovante',
      fields: [...SUBSCRIPTION_CONTEXT_FIELDS, ...RECEIPT_CONTEXT_FIELDS],
    },
  ],
  [Permission.Receipt.Approve]: [
    {
      label: 'Contexto necessário para aprovação',
      fields: ['pessoa inscrita', 'eventos selecionados', 'vagas', 'comprovante mais recente'],
    },
  ],
  [Permission.Receipt.Reject]: [
    {
      label: 'Contexto necessário para recusa',
      fields: ['pessoa inscrita', 'status da inscrição', 'comprovante mais recente'],
    },
  ],
  [Permission.Receipt.Undo]: [
    {
      label: 'Contexto da ação de validação',
      fields: ['pessoa inscrita', 'ação anterior', 'comprovante relacionado'],
    },
  ],
  [Permission.Certificate.Read]: [
    {
      label: 'Dados limitados da pessoa certificada',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto do certificado',
      fields: ['evento', 'grupo', 'grande evento', 'configuração', 'dados renderizados'],
    },
  ],
  [Permission.Certificate.Issue]: [
    {
      label: 'Dados limitados da pessoa elegível',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto de elegibilidade do certificado',
      fields: ['presenças', 'inscrições', 'eventos creditados', 'configuração'],
    },
  ],
  [Permission.Certificate.Reissue]: [
    {
      label: 'Dados limitados da pessoa certificada',
      fields: ['nome', 'ID da pessoa'],
    },
    {
      label: 'Contexto de reemissão',
      fields: ['certificado existente', 'configuração', 'dados renderizados'],
    },
  ],
  [Permission.Certificate.Delete]: [
    {
      label: 'Dados limitados do certificado existente',
      fields: ['pessoa certificada', 'configuração', 'evento ou grande evento'],
    },
  ],
};

export function getPermissionIncludedData(permission: Permission): readonly PermissionIncludedData[] {
  return EVENT_MANAGER_PERMISSION_INCLUDED_DATA[permission] ?? [];
}

export function getPermissionIncludedDataSummary(permission: Permission): string {
  return getPermissionIncludedData(permission)
    .map((item) => `${item.label}: ${item.fields.join(', ')}`)
    .join('; ');
}

export type EventManagerPermissionPreset = {
  id: string;
  label: string;
  description: string;
  icon: string;
  preferredScope: EventManagerPermissionGrantScope;
  permissions: PermissionRequirement;
};

export const EVENT_MANAGER_PERMISSION_PRESETS = [
  {
    id: 'major-event-admin',
    label: 'Administrador de grande evento',
    description: 'Gerencia grande evento, eventos, inscrições, presenças, certificados e recibos no escopo escolhido.',
    icon: 'admin_panel_settings',
    preferredScope: EventManagerPermissionGrantScope.MajorEvent,
    permissions: [
      Permission.MajorEvent.Read,
      Permission.MajorEvent.Update,
      Permission.Event.Read,
      Permission.Event.Create,
      Permission.Event.Update,
      Permission.Event.Delete,
      Permission.Subscription.Read,
      Permission.Subscription.Create,
      Permission.Subscription.Update,
      Permission.Subscription.Import,
      Permission.Subscription.Delete,
      Permission.Receipt.Read,
      Permission.Receipt.Approve,
      Permission.Receipt.Reject,
      Permission.Receipt.Undo,
      Permission.EventAttendance.Read,
      Permission.EventAttendance.Collect,
      Permission.EventAttendance.Import,
      Permission.EventAttendance.Update,
      Permission.EventAttendance.Delete,
      Permission.Certificate.Read,
      Permission.Certificate.Issue,
      Permission.Certificate.Reissue,
    ],
  },
  {
    id: 'major-event-receipt-validator',
    label: 'Validador de comprovantes',
    description: 'Valida, rejeita e desfaz validações de comprovantes dentro de um grande evento.',
    icon: 'fact_check',
    preferredScope: EventManagerPermissionGrantScope.MajorEvent,
    permissions: [
      Permission.MajorEvent.Read,
      Permission.Subscription.Read,
      Permission.Subscription.Update,
      Permission.Receipt.Read,
      Permission.Receipt.Approve,
      Permission.Receipt.Reject,
      Permission.Receipt.Undo,
    ],
  },
  {
    id: 'attendance-coordinator',
    label: 'Coordenador de presenças',
    description: 'Gerencia coleta, importação, ajustes e coletores de presença no escopo escolhido.',
    icon: 'how_to_reg',
    preferredScope: EventManagerPermissionGrantScope.Event,
    permissions: [
      Permission.Event.Read,
      Permission.MajorEvent.Read,
      Permission.EventAttendance.Read,
      Permission.EventAttendance.Collect,
      Permission.EventAttendance.Import,
      Permission.EventAttendance.Update,
      Permission.EventAttendance.Delete,
      Permission.EventAttendanceCollector.Read,
      Permission.EventAttendanceCollector.Create,
      Permission.EventAttendanceCollector.Delete,
    ],
  },
  {
    id: 'certificate-operator',
    label: 'Operador de certificados',
    description: 'Configura, emite, reemite e remove certificados no escopo escolhido.',
    icon: 'workspace_premium',
    preferredScope: EventManagerPermissionGrantScope.MajorEvent,
    permissions: [
      Permission.Certificate.Read,
      Permission.Certificate.Issue,
      Permission.Certificate.Reissue,
      Permission.Certificate.Delete,
      Permission.CertificateConfig.Read,
      Permission.CertificateConfig.Create,
      Permission.CertificateConfig.Update,
      Permission.CertificateConfig.Delete,
      Permission.Event.Read,
      Permission.EventGroup.Read,
      Permission.MajorEvent.Read,
    ],
  },
  {
    id: 'people-manager',
    label: 'Gestor de pessoas',
    description: 'Gerencia pessoas e resolução de duplicidades. Sempre global.',
    icon: 'group',
    preferredScope: EventManagerPermissionGrantScope.Global,
    permissions: [
      Permission.Person.Read,
      Permission.Person.Create,
      Permission.Person.Update,
      Permission.Person.Delete,
      Permission.MergeCandidate.Read,
      Permission.MergeCandidate.Create,
      Permission.MergeCandidate.Update,
      Permission.MergeCandidate.Scan,
      Permission.MergeCandidate.Merge,
      Permission.MergeCandidate.Undo,
      Permission.MergeCandidate.Delete,
    ],
  },
] as const satisfies readonly EventManagerPermissionPreset[];

export const DASHBOARD_PERMISSION_REQUIREMENTS = [
  Permission.Event.Read,
  Permission.Event.Update,
  Permission.MajorEvent.Read,
  Permission.MajorEvent.Update,
  Permission.Certificate.Issue,
  Permission.Certificate.Reissue,
  Permission.CertificateConfig.Update,
  Permission.MergeCandidate.Read,
  Permission.Receipt.Read,
  Permission.Receipt.Approve,
  Permission.Receipt.Reject,
] as const satisfies PermissionRequirement;

export function formatPermissionGroups(permissions: readonly string[]): PermissionGroup[] {
  const groupedPermissions = new Map<string, PermissionGroup>();

  for (const permission of permissions) {
    const { resource, scope } = parsePermission(permission);
    let group = groupedPermissions.get(resource);
    if (!group) {
      group = {
        type: resource,
        label: getPermissionResourceLabel(resource),
        resourceIcon: getPermissionResourceIcon(resource),
        actions: [],
      };
      groupedPermissions.set(resource, group);
    }

    if (!group.actions.some((entry) => entry.scope === scope)) {
      group.actions.push({
        scope,
        label: getPermissionScopeLabel(scope),
        icon: getPermissionScopeIcon(scope),
      });
    }
  }

  return [...groupedPermissions.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function parsePermission(permission: string): { resource: string; scope: string } {
  const [resource, scope = 'unknown'] = permission.split('#');

  return {
    resource: resource || 'unknown',
    scope,
  };
}

export function getPermissionScopeLabel(scope: string): string {
  switch (scope) {
    case 'read':
      return 'Visualizar';
    case 'create':
      return 'Criar';
    case 'update':
      return 'Atualizar';
    case 'delete':
      return 'Excluir';
    case 'collect':
      return 'Coletar';
    case 'import':
      return 'Importar';
    case 'approve':
      return 'Aprovar';
    case 'reject':
      return 'Rejeitar';
    case 'undo':
      return 'Desfazer';
    case 'issue':
      return 'Emitir';
    case 'reissue':
      return 'Reemitir';
    case 'merge':
      return 'Mesclar';
    case 'scan':
      return 'Buscar';
    default:
      return scope;
  }
}

export function getPermissionResourceLabel(resource: string): string {
  switch (resource) {
    case 'certificate':
      return 'Certificado';
    case 'certificate-config':
      return 'Configuração de certificado';
    case 'event':
      return 'Evento';
    case 'event-attendance':
      return 'Presenças';
    case 'event-attendance-collector':
      return 'Coletor de presença';
    case 'event-group':
      return 'Grupo de eventos';
    case 'event-lecturer':
      return 'Palestrante';
    case 'frozen':
      return 'Dados congelados';
    case 'major-event':
      return 'Grande evento';
    case 'merge-candidate':
      return 'Pessoa duplicada';
    case 'person':
      return 'Pessoa';
    case 'permission-grant':
      return 'Permissão do Event Manager';
    case 'place-preset':
      return 'Local';
    case 'receipt':
      return 'Comprovante';
    case 'subscription':
      return 'Inscrição';
    case 'user':
      return 'Usuário';
    default:
      return resource;
  }
}

export function getPermissionResourceIcon(resource: string): string {
  switch (resource) {
    case 'certificate':
    case 'certificate-config':
      return 'workspace_premium';
    case 'event':
      return 'event';
    case 'event-attendance':
    case 'event-attendance-collector':
      return 'fact_check';
    case 'event-group':
      return 'folder';
    case 'event-lecturer':
      return 'record_voice_over';
    case 'frozen':
      return 'lock';
    case 'major-event':
      return 'festival';
    case 'merge-candidate':
      return 'merge_type';
    case 'person':
      return 'person';
    case 'permission-grant':
      return 'admin_panel_settings';
    case 'place-preset':
      return 'place';
    case 'receipt':
      return 'receipt_long';
    case 'subscription':
      return 'how_to_reg';
    case 'user':
      return 'account_circle';
    default:
      return 'shield';
  }
}

export function getPermissionScopeIcon(scope: string): string {
  switch (scope) {
    case 'read':
      return 'visibility';
    case 'create':
      return 'add';
    case 'update':
      return 'edit';
    case 'delete':
      return 'delete';
    case 'collect':
      return 'fact_check';
    case 'import':
      return 'upload_file';
    case 'approve':
      return 'check_circle';
    case 'reject':
      return 'cancel';
    case 'undo':
      return 'undo';
    case 'issue':
      return 'workspace_premium';
    case 'reissue':
      return 'sync';
    case 'merge':
      return 'merge_type';
    case 'scan':
      return 'search';
    default:
      return 'help';
  }
}
