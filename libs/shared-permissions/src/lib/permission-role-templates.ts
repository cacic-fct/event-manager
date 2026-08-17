import { EVENT_MANAGER_PERMISSION_PRESETS } from './permission-presets';
import { EventManagerPermissionGrantScope, Permission, type PermissionRequirement } from './permission-types';

export type EventManagerRoleTemplate = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  permissions: PermissionRequirement;
  suggestedScopes: readonly EventManagerPermissionGrantScope[];
};

const presetPermissions = (id: string): PermissionRequirement =>
  EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === id)?.permissions ?? [];

const withRelatedPeople = (permissions: PermissionRequirement): PermissionRequirement => [
  ...new Set([...permissions, Permission.RelatedPerson.Read]),
];

export const EVENT_MANAGER_ROLE_TEMPLATES = [
  {
    id: 'content-and-schedule',
    name: 'Conteúdo e programação',
    description: 'Estrutura eventos, gerencia ministrantes, formulários e publicação sem acesso financeiro.',
    emoji: '🗓️',
    permissions: withRelatedPeople(presetPermissions('event-structure-manager')),
    suggestedScopes: [
      EventManagerPermissionGrantScope.MajorEvent,
      EventManagerPermissionGrantScope.EventGroup,
      EventManagerPermissionGrantScope.Event,
    ],
  },
  {
    id: 'participation',
    name: 'Gestão de participação',
    description: 'Gerencia inscrições e dados operacionais das pessoas relacionadas aos eventos atribuídos.',
    emoji: '🎟️',
    permissions: withRelatedPeople([
      Permission.Event.Read,
      Permission.Subscription.Read,
      Permission.Subscription.Create,
      Permission.Subscription.Update,
      Permission.Subscription.Import,
    ]),
    suggestedScopes: [EventManagerPermissionGrantScope.MajorEvent, EventManagerPermissionGrantScope.Event],
  },
  {
    id: 'attendance',
    name: 'Presenças',
    description: 'Coleta, importa e corrige presenças, além de administrar coletores.',
    emoji: '✅',
    permissions: withRelatedPeople(presetPermissions('attendance-coordinator')),
    suggestedScopes: [
      EventManagerPermissionGrantScope.MajorEvent,
      EventManagerPermissionGrantScope.EventGroup,
      EventManagerPermissionGrantScope.Event,
    ],
  },
  {
    id: 'certificates',
    name: 'Certificados',
    description: 'Configura, emite e reemite certificados dentro dos escopos atribuídos.',
    emoji: '🎓',
    permissions: withRelatedPeople([
      ...presetPermissions('certificate-operator'),
      Permission.EventAttendance.Read,
      Permission.Subscription.Read,
    ]),
    suggestedScopes: [EventManagerPermissionGrantScope.MajorEvent, EventManagerPermissionGrantScope.Event],
  },
  {
    id: 'forms',
    name: 'Formulários',
    description: 'Cria, publica, analisa e exporta formulários e respostas autorizadas.',
    emoji: '📝',
    permissions: presetPermissions('form-manager'),
    suggestedScopes: [EventManagerPermissionGrantScope.MajorEvent, EventManagerPermissionGrantScope.Event],
  },
  {
    id: 'payments',
    name: 'Validação financeira',
    description: 'Consulta, aprova e recusa comprovantes sem administrar outras áreas do evento.',
    emoji: '🧾',
    permissions: withRelatedPeople(presetPermissions('major-event-receipt-validator')),
    suggestedScopes: [EventManagerPermissionGrantScope.MajorEvent],
  },
  {
    id: 'sports-operations',
    name: 'Operação esportiva',
    description: 'Opera partidas, escalações, arbitragem e placares sem administrar toda a plataforma.',
    emoji: '🏟️',
    permissions: withRelatedPeople([
      Permission.Event.Read,
      Permission.SportsMatch.Read,
      Permission.SportsMatch.Operate,
      Permission.SportsOfficial.Read,
      Permission.SportsScore.Read,
      Permission.SportsScore.Update,
    ]),
    suggestedScopes: [EventManagerPermissionGrantScope.EventGroup, EventManagerPermissionGrantScope.Event],
  },
] as const satisfies readonly EventManagerRoleTemplate[];

export type EventManagerRoleTemplateId = (typeof EVENT_MANAGER_ROLE_TEMPLATES)[number]['id'];
