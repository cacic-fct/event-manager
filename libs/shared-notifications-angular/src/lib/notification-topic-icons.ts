import type { Notification } from '@novu/js';

const WORKFLOW_NOTIFICATION_ICONS: Readonly<Record<string, string>> = {
  'major-event-subscription-status-changed': 'how_to_reg',
  'offline-attendance-review-queued': 'fact_check',
  'certificate-available': 'workspace_premium',
  'event-form-available': 'list_alt',
  'audience-invitation': 'event',
  'ticket-transfer': 'confirmation_number',
  'event-manual-notification': 'campaign',
  'event-subscriber-information': 'campaign',
  'online-attendance-available': 'fact_check',
  'prize-draw-winner': 'rewarded_ads',
  'prize-draw-undone': 'rewarded_ads',
};

const TOPIC_PATTERNS: ReadonlyArray<{ pattern: RegExp; icon: string }> = [
  {
    pattern:
      /(?:review|revis).{0,40}(?:attendance|presenca|check.?in)|(?:attendance|presenca|check.?in).{0,40}(?:review|revis|offline|off.?line)/,
    icon: 'fact_check',
  },
  { pattern: /\b(?:ticket|bilhete|ingresso|transferencia|transfer)\b/, icon: 'confirmation_number' },
  { pattern: /(?:certificate|certificad)/, icon: 'workspace_premium' },
  { pattern: /(?:formulario|questionario|documento|\bform\b|\bdocument\b)/, icon: 'list_alt' },
  {
    pattern:
      /(?:sorteio|prize draw|resultado).{0,40}(?:desfeito|cancelado|invalidado|undone|canceled|cancelled)|(?:desfeito|cancelado|invalidado|undone|canceled|cancelled).{0,40}(?:sorteio|prize draw|resultado)/,
    icon: 'rewarded_ads',
  },
  { pattern: /(?:sorteio|prize draw|premio|winner|ganhou)/, icon: 'rewarded_ads' },
  { pattern: /(?:convite|invitation)/, icon: 'event' },
  { pattern: /(?:presenca|attendance|check.?in)/, icon: 'fact_check' },
  { pattern: /(?:inscricao|subscription|registration|pagamento|payment)/, icon: 'how_to_reg' },
  { pattern: /(?:evento|\bevent\b|informacao|orientacao|\baviso\b|organizacao)/, icon: 'campaign' },
];

const TOPIC_DATA_KEYS = ['topic', 'notificationType', 'category', 'type', 'title', 'subject', 'body'];

export function notificationWorkflowIcon(identifier: string | undefined): string | null {
  return identifier ? (WORKFLOW_NOTIFICATION_ICONS[identifier] ?? null) : null;
}

export function notificationTopicIcon(notification: Notification): string | null {
  const workflowIcon = notificationWorkflowIcon(notification.workflow?.identifier);
  if (workflowIcon) {
    return workflowIcon;
  }

  const dataContent = TOPIC_DATA_KEYS.map((key) => notification.data?.[key]).filter(
    (value): value is string => typeof value === 'string',
  );
  const content = [
    notification.workflow?.name,
    notification.subject,
    notification.body.replace(/<[^>]*>/g, ' '),
    ...(notification.tags ?? []),
    ...dataContent,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return TOPIC_PATTERNS.find(({ pattern }) => pattern.test(content))?.icon ?? null;
}
