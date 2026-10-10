import { Component, computed, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

export type ShowcaseNotificationDestination = 'receipt' | 'event-info' | 'ticket-transfer' | 'certificates' | 'attendance';

interface ShowcaseNotification {
  id: string;
  title: string;
  description: string;
  emoji: string;
  time: string;
  destination: ShowcaseNotificationDestination;
  read: boolean;
}

const NOTIFICATIONS: readonly ShowcaseNotification[] = [
  {
    id: 'transfer',
    title: 'Um bilhete para você',
    description: 'Marina quer transferir o Kit de boas-vindas. Abra para ver como receber.',
    emoji: '🎒',
    time: 'Agora',
    destination: 'ticket-transfer',
    read: false,
  },
  {
    id: 'certificate',
    title: 'Seu certificado está disponível',
    description: 'Semana de Tecnologia: veja sua participação e os certificados emitidos.',
    emoji: '💻',
    time: 'Há 5 min',
    destination: 'certificates',
    read: false,
  },
  {
    id: 'receipt',
    title: 'Falta enviar seu comprovante',
    description: 'Jornada de Inovação: anexe o comprovante para validar sua inscrição.',
    emoji: '💡',
    time: 'Há 20 min',
    destination: 'receipt',
    read: false,
  },
  {
    id: 'event',
    title: 'Seu próximo minicurso',
    description: 'Realidade Virtual: confira as informações e o mapa do Auditório.',
    emoji: '🥽',
    time: 'Há 1 h',
    destination: 'event-info',
    read: true,
  },
  {
    id: 'attendance',
    title: 'Confirme sua presença',
    description: 'Interfaces que incluem: o autorregistro está disponível.',
    emoji: '♿',
    time: 'Há 2 h',
    destination: 'attendance',
    read: true,
  },
];

@Component({
  selector: 'app-landing-notifications-demo',
  imports: [MatButtonModule, MatIconModule, TwemojiComponent],
  templateUrl: './notifications-demo.html',
  styleUrl: './notifications-demo.scss',
})
export class NotificationsDemoComponent {
  readonly openDestination = output<ShowcaseNotificationDestination>();
  readonly notifications = signal<readonly ShowcaseNotification[]>(NOTIFICATIONS);
  readonly unreadOnly = signal(false);
  readonly unreadCount = computed(() => this.notifications().filter((item) => !item.read).length);
  readonly visibleNotifications = computed(() => this.notifications().filter((item) => !this.unreadOnly() || !item.read));

  openNotification(notification: ShowcaseNotification): void {
    this.notifications.update((items) => items.map((item) => item.id === notification.id ? { ...item, read: true } : item));
    this.openDestination.emit(notification.destination);
  }

  markAllRead(): void {
    this.notifications.update((items) => items.map((item) => ({ ...item, read: true })));
  }
}
