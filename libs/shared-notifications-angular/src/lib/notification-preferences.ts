import type { Preference } from '@novu/js';

type PreferenceCategory = 'channels' | 'events' | 'draws' | 'other';

interface WorkflowPresentation {
  title: string;
  description: string;
  icon: string;
  category: PreferenceCategory;
}

export interface NotificationPreferenceItem extends WorkflowPresentation {
  key: string;
  preference: Preference;
}

// Keep Novu's critical workflow configuration aligned with this local safeguard.
const REQUIRED_WORKFLOWS = new Set([
  'offline-attendance-review-queued',
  'audience-invitation',
  'major-event-subscription-status-changed',
  'ticket-transfer',
  'event-subscriber-information',
]);

const WORKFLOW_PRESENTATION: Readonly<Record<string, WorkflowPresentation>> = {
  'online-attendance-available': {
    title: 'Presença online',
    description: 'Quando a confirmação abrir.',
    icon: 'online_prediction',
    category: 'events',
  },
  'event-form-available': {
    title: 'Formulários',
    description: 'Novos formulários para responder.',
    icon: 'assignment',
    category: 'events',
  },
  'certificate-available': {
    title: 'Certificados',
    description: 'Prontos para baixar.',
    icon: 'workspace_premium',
    category: 'events',
  },
  'prize-draw-winner': {
    title: 'Prêmios',
    description: 'Quando você ganhar um sorteio.',
    icon: 'emoji_events',
    category: 'draws',
  },
  'prize-draw-undone': {
    title: 'Sorteios desfeitos',
    description: 'Quando seu resultado for desfeito.',
    icon: 'undo',
    category: 'draws',
  },
};

const CATEGORIES: ReadonlyArray<{ id: PreferenceCategory; title: string }> = [
  { id: 'channels', title: 'Canais' },
  { id: 'events', title: 'Eventos' },
  { id: 'draws', title: 'Sorteios' },
  { id: 'other', title: 'Outros avisos' },
];

export function isRequiredNotificationPreference(preference: Preference): boolean {
  return preference.workflow?.critical === true || REQUIRED_WORKFLOWS.has(preference.workflow?.identifier ?? '');
}

export function notificationPreferenceGroups(preferences: Preference[]) {
  const optionalPreferences = preferences.filter((preference) => !isRequiredNotificationPreference(preference));
  const items = optionalPreferences.map((preference): NotificationPreferenceItem => {
    const workflow = preference.workflow;
    const presentation = workflow
      ? (WORKFLOW_PRESENTATION[workflow.identifier] ?? {
          title: workflow.name || 'Notificação',
          description: 'Escolha onde receber.',
          icon: 'notifications',
          category: 'other' as const,
        })
      : {
          title: 'Avisos opcionais',
          description: 'Vale para todos os avisos abaixo.',
          icon: 'tune',
          category: 'channels' as const,
        };
    return {
      ...presentation,
      key: workflow?.id ?? preference.level,
      preference,
    };
  });
  return CATEGORIES.map((category) => ({
    ...category,
    items: items
      .filter((item) => item.category === category.id)
      .sort((left, right) => left.title.localeCompare(right.title, 'pt-BR') || left.key.localeCompare(right.key)),
  })).filter((category) => category.items.length > 0);
}
