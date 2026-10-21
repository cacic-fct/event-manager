import { NotFoundException } from '@nestjs/common';
import type { TransferResource } from '@cacic-fct/shared-data-transfer';
import type { TransferAdapterContext, TransferAuthorizationScope } from './data-transfer-adapter';

export async function ticketTransferEventScope(
  eventId: string,
  context: TransferAdapterContext,
): Promise<TransferAuthorizationScope> {
  const existing = await context.tx.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, eventGroupId: true, majorEventId: true },
  });
  if (existing) {
    const group = existing.eventGroupId
      ? await context.tx.eventGroup.findFirst({
          where: { id: existing.eventGroupId, deletedAt: null },
          select: { majorEventId: true },
        })
      : null;
    const majorEventId = existing.majorEventId ?? group?.majorEventId;
    return {
      eventId,
      ...(existing.eventGroupId ? { eventGroupId: existing.eventGroupId } : {}),
      ...(majorEventId ? { majorEventId } : {}),
    };
  }
  const proposed = context.document.resources.find((row) => row.kind === 'event' && row.id === eventId);
  if (proposed?.kind !== 'event') throw new NotFoundException();
  if (proposed.data.eventGroupId) {
    const group = await context.tx.eventGroup.findFirst({
      where: { id: proposed.data.eventGroupId, deletedAt: null },
      select: { id: true, majorEventId: true },
    });
    if (group) return { eventGroupId: group.id, ...(group.majorEventId ? { majorEventId: group.majorEventId } : {}) };
    const plannedGroup = context.document.resources.find(
      (row) => row.kind === 'group' && row.id === proposed.data.eventGroupId,
    );
    if (plannedGroup?.kind === 'group' && plannedGroup.data.majorEventId)
      return { majorEventId: plannedGroup.data.majorEventId };
  }
  return proposed.data.majorEventId ? { majorEventId: proposed.data.majorEventId } : {};
}

export async function ticketTransferContext(
  eventId: string,
  context: TransferAdapterContext,
  resources: readonly TransferResource[],
) {
  const event = await context.tx.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { name: true, emoji: true, endDate: true, majorEventId: true, eventGroupId: true, updatedAt: true },
  });
  const proposed = resources.find((row) => row.kind === 'event' && row.id === eventId);
  const data = { ...event, ...(proposed?.kind === 'event' ? proposed.data : {}) };
  const group = data.eventGroupId
    ? await context.tx.eventGroup.findFirst({
        where: { id: data.eventGroupId, deletedAt: null },
        select: { majorEventId: true },
      })
    : null;
  const plannedGroup = resources.find((row) => row.kind === 'group' && row.id === data.eventGroupId);
  const majorEventId =
    data.majorEventId ??
    (plannedGroup?.kind === 'group' ? plannedGroup.data.majorEventId : undefined) ??
    group?.majorEventId;
  const config = await context.tx.ticketConfig.findUnique({
    where: { eventId },
    select: {
      id: true,
      enabled: true,
      displayName: true,
      displayEmoji: true,
      expirationMode: true,
      customExpiresAt: true,
      updatedAt: true,
    },
  });
  const plannedConfig = resources.find((row) => row.kind === 'ticket-config' && row.data.eventId === eventId);
  const effectiveConfig =
    plannedConfig?.kind === 'ticket-config'
      ? { ...config, ...plannedConfig.data, id: config?.id ?? plannedConfig.id }
      : config;
  const expiration = effectiveConfig?.expirationMode === 'CUSTOM' ? effectiveConfig.customExpiresAt : data.endDate;
  return {
    name: data.name ?? '',
    emoji: data.emoji ?? null,
    majorEventId: majorEventId ?? null,
    config: effectiveConfig
      ? {
          id: effectiveConfig.id,
          enabled: effectiveConfig.enabled ?? false,
          displayName: effectiveConfig.displayName ?? null,
          displayEmoji: effectiveConfig.displayEmoji ?? null,
          expirationMode: effectiveConfig.expirationMode ?? 'EVENT_END',
          updatedAt: config?.updatedAt.toISOString() ?? null,
          customExpiresAt: effectiveConfig.customExpiresAt
            ? new Date(effectiveConfig.customExpiresAt).toISOString()
            : null,
        }
      : null,
    eventRevision: event?.updatedAt.toISOString() ?? null,
    expiresAt: expiration ? new Date(expiration).toISOString() : null,
  };
}
