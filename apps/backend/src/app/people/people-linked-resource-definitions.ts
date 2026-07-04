import {
  PersonLinkedResource,
  PersonLinkedResourceGroup,
} from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PersonLinkedResourceInput = Omit<PersonLinkedResource, 'description' | 'route' | 'status' | 'occurredAt'> & {
  description?: string | null;
  route?: string | null;
  status?: string | null;
  occurredAt?: Date | null;
};

export type PersonLinkedResourceGroupInput = Omit<PersonLinkedResourceGroup, 'items' | 'totalCount'> & {
  items: PersonLinkedResourceInput[];
};

export type PersonLinkedResourceGroupDefinition = Omit<PersonLinkedResourceGroup, 'items' | 'totalCount'>;

export const PERSON_LINKED_RESOURCE_GROUPS = [
  { type: 'USER', label: 'Usuário vinculado', icon: 'account_circle' },
  { type: 'CERTIFICATE', label: 'Certificados', icon: 'workspace_premium' },
  { type: 'SUBSCRIPTION', label: 'Inscrições', icon: 'confirmation_number' },
  { type: 'ATTENDANCE', label: 'Presenças', icon: 'how_to_reg' },
  { type: 'EVENT_RELATION', label: 'Vínculos com eventos', icon: 'event_available' },
  { type: 'OFFLINE_ATTENDANCE_SUBMISSION', label: 'Coletas offline', icon: 'sync_problem' },
  { type: 'RECEIPT', label: 'Comprovantes', icon: 'receipt_long' },
  { type: 'LECTURER_PROFILE', label: 'Perfil de ministrante', icon: 'badge' },
  { type: 'PERMISSION_GRANT', label: 'Permissões', icon: 'admin_panel_settings' },
  { type: 'MERGE', label: 'Unificações', icon: 'call_merge' },
] satisfies PersonLinkedResourceGroupDefinition[];

export type PersonLinkedResourceGroupType = (typeof PERSON_LINKED_RESOURCE_GROUPS)[number]['type'];

export type PersonLinkedResourcePrisma = PrismaService | Prisma.TransactionClient;

export function getLinkedResourceGroupDefinition(type: string): PersonLinkedResourceGroupDefinition {
  const definition = PERSON_LINKED_RESOURCE_GROUPS.find((group) => group.type === type);
  if (!definition) {
    throw new NotFoundException(`Linked resource group ${type} was not found.`);
  }

  return definition;
}

export function buildLinkedGroup(
  type: string,
  label: string,
  icon: string,
  items: PersonLinkedResourceInput[],
): PersonLinkedResourceGroupInput {
  return { type, label, icon, items };
}

export function normalizeLinkedResourceGroups(
  groups: PersonLinkedResourceGroupInput[],
): PersonLinkedResourceGroup[] {
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      type: group.type,
      label: group.label,
      icon: group.icon,
      items: group.items,
      totalCount: group.items.length,
    }));
}

export function getCertificateTargetLabel(config: {
  scope: string;
  event?: { name: string } | null;
  eventGroup?: { name: string } | null;
  majorEvent?: { name: string } | null;
}): string | null {
  if (config.event) {
    return `Evento: ${config.event.name}`;
  }

  if (config.eventGroup) {
    return `Grupo de eventos: ${config.eventGroup.name}`;
  }

  if (config.majorEvent) {
    return `Grande evento: ${config.majorEvent.name}`;
  }

  return config.scope;
}

export function getCertificateRoute(config: {
  id: string;
  eventId?: string | null;
  eventGroupId?: string | null;
  majorEventId?: string | null;
}): string | null {
  if (config.eventId) {
    return `/certificates/event/${config.eventId}/${config.id}`;
  }

  if (config.eventGroupId) {
    return `/certificates/event-group/${config.eventGroupId}/${config.id}`;
  }

  if (config.majorEventId) {
    return `/certificates/major-event/${config.majorEventId}/${config.id}`;
  }

  return '/certificates';
}

export function getPermissionGrantTargetLabel(grant: {
  event?: { name: string } | null;
  eventGroup?: { name: string } | null;
  majorEvent?: { name: string } | null;
}): string {
  return grant.event?.name ?? grant.eventGroup?.name ?? grant.majorEvent?.name ?? 'Escopo global';
}
