import { randomBytes } from 'node:crypto';
import { parseEventMaterials, type EventMaterial } from '@cacic-fct/shared-event-preparation';
import { Permission } from '@cacic-fct/shared-permissions';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, type Prisma } from '@prisma/client';
import type { AuditLogService } from '../audit-log/audit-log.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { materialKey } from './content-review-changes';

export async function lockPreparationEvent(tx: Prisma.TransactionClient, eventId: string) {
  await tx.$executeRaw`SELECT "id" FROM "events" WHERE "id" = ${eventId} AND "deletedAt" IS NULL FOR UPDATE`;
  const event = await tx.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      name: true,
      lecturerInformation: true,
      collectorInformation: true,
      preparationUpdatedAt: true,
      materials: true,
      materialsUpdatedAt: true,
    },
  });
  if (!event) throw new NotFoundException('Evento não encontrado.');
  return event;
}

export function nextContentRevision(...previous: (Date | null | undefined)[]): Date {
  return new Date(Math.max(Date.now(), ...previous.map((date) => (date?.getTime() ?? 0) + 1)));
}

export function materialDraftRevision(published: Date | null, review: Date | undefined): Date | null {
  if (!review || (published && published > review)) return published;
  return review;
}

export function parseMaterialSubmission(links: EventMaterial[]): EventMaterial[] {
  const normalized = parseEventMaterials(links);
  const explicitIds = new Set(normalized.flatMap(({ id }) => (id ? [id] : [])));
  return normalized.map(({ id, ...link }) => {
    const legacyKey = materialKey(link);
    if (id && id !== legacyKey) return { id, ...link };
    // A different material may have kept this URL's identity after changing its address.
    if (!id && explicitIds.has(legacyKey)) return { id: randomBytes(32).toString('base64url'), ...link };
    return link;
  });
}

export function validateApprovedMaterials(links: EventMaterial[]): EventMaterial[] {
  try {
    return parseEventMaterials(links);
  } catch (error) {
    throw new ConflictException(error instanceof Error ? error.message : 'Materiais inválidos.');
  }
}

export async function publishMaterials(params: {
  tx: Prisma.TransactionClient;
  audit: AuditLogService;
  user: AuthenticatedUser;
  eventId: string;
  name: string;
  before: Prisma.JsonValue;
  links: EventMaterial[];
  updatedAt: Date;
  review?: { permission: Permission; metadata: { contentReviewId: string; keys: string[] } };
}): Promise<void> {
  const { tx, audit, user, eventId, name, before, links, updatedAt, review } = params;
  await tx.event.update({
    where: { id: eventId },
    data: { materials: links.map((link) => ({ ...link })), materialsUpdatedAt: updatedAt, updatedById: user.sub },
  });
  await audit.record(
    {
      entityType: AuditLogEntityType.EVENT,
      entityId: eventId,
      entityLabel: name,
      operation: review ? AuditLogOperation.APPROVE : AuditLogOperation.UPDATE,
      actor: user,
      before: { materials: before },
      after: { materials: links },
      scope: { eventId, permission: review?.permission ?? Permission.Event.Update },
      summary: review ? 'Alterações em materiais para inscritos aprovadas.' : 'Materiais para inscritos atualizados.',
      ...(review ? { metadata: review.metadata, force: true } : {}),
      squashWindowMs: 0,
    },
    tx,
  );
}
