import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { NotificationRecipient } from './novu-notification.types';

type NotificationPerson = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  userId?: string | null;
  user?: { id: string; email: string; name: string } | null;
};

export function mapAuthenticatedUserToRecipient(user: AuthenticatedUser): NotificationRecipient {
  const subscriberId = user.sub ?? user.email ?? user.preferredUsername;
  if (!subscriberId) {
    throw new Error('Authenticated user does not have a stable subscriber identifier.');
  }

  return {
    subscriberId,
    email: user.email,
    firstName: typeof user.claims.given_name === 'string' ? user.claims.given_name : undefined,
    lastName: typeof user.claims.family_name === 'string' ? user.claims.family_name : undefined,
    data: { preferredUsername: user.preferredUsername },
  };
}

export function mapPersonToRecipient(person: NotificationPerson): NotificationRecipient {
  const [firstName, ...lastNameParts] = person.name.trim().split(/\s+/);
  return {
    subscriberId: person.userId ?? person.user?.id ?? person.email ?? person.id,
    email: person.email ?? person.user?.email ?? undefined,
    phone: person.phone ?? undefined,
    firstName: firstName || undefined,
    lastName: lastNameParts.join(' ') || undefined,
    data: { personId: person.id },
  };
}

export function mapUserToRecipient(user: { id: string; email: string; name: string }): NotificationRecipient {
  const [firstName, ...lastNameParts] = user.name.trim().split(/\s+/);
  return {
    subscriberId: user.id,
    email: user.email,
    firstName: firstName || undefined,
    lastName: lastNameParts.join(' ') || undefined,
    data: { userId: user.id },
  };
}
