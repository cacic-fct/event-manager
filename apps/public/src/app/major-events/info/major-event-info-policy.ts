import type { PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { getSubscriptionStatusLabel, type CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import type { MajorEventInfoLink, MajorEventInfoRegistration } from './major-event-info';

const RECEIPT_UPLOAD_STATUSES = new Set([
  'WAITING_RECEIPT_UPLOAD',
  'REJECTED_INVALID_RECEIPT',
  'REJECTED_GENERIC',
  'REJECTED_NO_SLOTS',
  'REJECTED_SCHEDULE_CONFLICT',
]);

export function majorEventRegistrationInfo(
  event: PublicMajorEvent,
  authenticated: boolean,
  subscription: CurrentUserMajorEventSubscription | null,
  now: number,
): MajorEventInfoRegistration {
  const route = ['/major-event', event.id, event.rankedSubscriptionEnabled ? 'ranked-subscription' : 'subscription'];
  if (subscription && event.isPaymentRequired && RECEIPT_UPLOAD_STATUSES.has(subscription.subscriptionStatus)) {
    return {
      title: getSubscriptionStatusLabel(subscription.subscriptionStatus),
      action: { label: 'Enviar comprovante', route: ['/major-event', event.id, 'payment'] },
    };
  }
  if (Date.parse(event.endDate) <= now) {
    return {
      title: 'Evento encerrado',
      description: 'A programação continua disponível para consulta.',
      action: subscription ? { label: 'Ver minhas participações', route: ['/profile', 'attendances'] } : undefined,
    };
  }

  if (subscription) {
    const title = getSubscriptionStatusLabel(subscription.subscriptionStatus);
    if (subscription.subscriptionStatus === 'CANCELED') {
      return { title, action: { label: 'Ver minhas participações', route: ['/profile', 'attendances'] } };
    }
    if (subscription.subscriptionStatus === 'CONFIRMED') {
      const canChooseActivities =
        event.sportsTournament && event.hasEvents !== false && !subscription.selectedEvents?.length;
      return {
        title: 'Inscrição confirmada',
        action: canChooseActivities
          ? { label: 'Escolher atividades', route }
          : { label: 'Ver minhas participações', route: ['/profile', 'attendances'] },
      };
    }
    return { title, action: { label: 'Ver minha inscrição', route } };
  }

  if (event.hasEvents === false) {
    const tournament = event.sportsTournament;
    if (tournament?.selfSubscriptionEnabled && tournament.registrationOpen) {
      return {
        title: 'Inscrições abertas',
        action: authenticated
          ? { label: 'Solicitar inscrição no torneio', route: ['/tournament', tournament.id, 'subscribe'] }
          : { label: 'Entrar para solicitar inscrição', login: true },
      };
    }
    return { title: 'Participação', description: 'Consulte a programação e as orientações da organização.' };
  }

  if (event.subscriptionStartDate && Date.parse(event.subscriptionStartDate) > now) {
    return { title: 'Inscrições em breve', description: 'Confira abaixo o período de inscrições.' };
  }
  if (
    (event.subscriptionEndDate && Date.parse(event.subscriptionEndDate) < now) ||
    event.regularSubscriptionOpen === false
  ) {
    return { title: 'Inscrições encerradas', description: 'Você pode consultar as atividades e seus detalhes.' };
  }
  return {
    title: 'Inscrições abertas',
    description: event.sportsTournament ? 'Escolha as atividades de que deseja participar.' : undefined,
    action: authenticated ? { label: 'Inscrever-se', route } : { label: 'Entrar para inscrever-se', login: true },
  };
}

export function majorEventInfoLinks(event: PublicMajorEvent): MajorEventInfoLink[] {
  const links: MajorEventInfoLink[] = [];
  if (event.sportsTournament) {
    links.push({ label: 'Ver torneio', icon: 'emoji_events', route: ['/tournament', event.sportsTournament.id] });
  }
  const externalUrl = safeWebUrl(event.buttonLink);
  if (externalUrl) {
    links.push({ label: event.buttonText?.trim() || 'Site do evento', icon: 'link', href: externalUrl });
  }
  const contact = event.contactInfo?.trim();
  if (!contact) {
    return links;
  }
  if (event.contactType === 'EMAIL' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    links.push({ label: 'Falar com a organização', icon: 'mail', href: `mailto:${contact}` });
  } else if (event.contactType === 'WHATSAPP' || event.contactType === 'PHONE') {
    const digits = contact.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 15) {
      links.push({
        label: event.contactType === 'WHATSAPP' ? 'Contato por WhatsApp' : 'Ligar para a organização',
        icon: 'call',
        href:
          event.contactType === 'WHATSAPP'
            ? `https://wa.me/${digits}`
            : `tel:${contact.startsWith('+') ? '+' : ''}${digits}`,
      });
    }
  }
  return links;
}

function safeWebUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}
