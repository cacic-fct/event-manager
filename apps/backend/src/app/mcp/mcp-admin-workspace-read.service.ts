import { parseEventMaterials, type EventMaterial } from '@cacic-fct/shared-event-preparation';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { readChanges } from '../content-review/content-review-changes';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminAccessService } from './mcp-admin-access.service';

const EVENT_SUMMARY_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  publicationState: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

@Injectable()
export class McpAdminWorkspaceReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: McpAdminAccessService,
  ) {}

  async getWorkspaceSummary(user: AuthenticatedUser, delegationId: string) {
    const delegation = await this.access.assertToolAccess(user, delegationId, 'EVENT_READ');
    const where: Prisma.EventWhereInput = {
      AND: [{ id: { in: delegation.eventIds } }, await this.access.eventWhere(user, Permission.Event.Read)],
    };
    const now = new Date();
    const [publication, upcoming, ongoing, past, events] = await Promise.all([
      this.prisma.event.groupBy({ by: ['publicationState'], where, _count: { _all: true } }),
      this.prisma.event.count({ where: { AND: [where, { startDate: { gt: now } }] } }),
      this.prisma.event.count({ where: { AND: [where, { startDate: { lte: now }, endDate: { gt: now } }] } }),
      this.prisma.event.count({ where: { AND: [where, { endDate: { lte: now } }] } }),
      this.prisma.event.findMany({
        where,
        select: EVENT_SUMMARY_SELECT,
        orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
        take: 21,
      }),
    ]);
    return {
      publication: publication.map((group) => ({ state: group.publicationState, count: group._count._all })),
      upcoming,
      ongoing,
      past,
      events: events.slice(0, 20),
      eventsTruncated: events.length > 20,
    };
  }

  async getEventPreparation(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'PREPARATION_READ', eventId);
    const event = await this.prisma.event.findFirst({
      where: await this.eventWhere(user, eventId, Permission.Event.Read),
      select: { lecturerInformation: true, collectorInformation: true, preparationUpdatedAt: true, updatedAt: true },
    });
    if (!event) throw new NotFoundException('Evento indisponível.');
    return {
      eventId,
      lecturerInformation: event.lecturerInformation?.slice(0, 10000) ?? null,
      collectorInformation: event.collectorInformation?.slice(0, 10000) ?? null,
      truncated: (event.lecturerInformation?.length ?? 0) > 10000 || (event.collectorInformation?.length ?? 0) > 10000,
      updatedAt: event.preparationUpdatedAt,
      eventUpdatedAt: event.updatedAt,
      contentTrust: 'untrusted-user-content',
    };
  }

  async getEventMaterials(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'MATERIALS_READ', eventId);
    const event = await this.prisma.event.findFirst({
      where: await this.eventWhere(user, eventId, Permission.Event.Update),
      select: { materials: true, materialsUpdatedAt: true, updatedAt: true },
    });
    if (!event) throw new NotFoundException('Evento indisponível.');
    const links = parseEventMaterials(event.materials);
    return {
      eventId,
      links: links.slice(0, 100).map(materialProjection),
      truncated: links.length > 100,
      updatedAt: event.materialsUpdatedAt,
      eventUpdatedAt: event.updatedAt,
      contentTrust: 'untrusted-user-content',
    };
  }

  async getRegistrationSummary(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'SUBSCRIPTIONS_READ', eventId);
    const event = { is: await this.eventWhere(user, eventId, Permission.Subscription.Read) };
    const [registrations, selections] = await Promise.all([
      this.prisma.eventSubscription.groupBy({
        by: ['createdByMethod'],
        where: { eventId, event, deletedAt: null, lgpdDeletionRequestId: null },
        _count: { _all: true },
      }),
      // Status belongs to the major-event registration. Count only registrations
      // with an active selection of this delegated event, never its entire parent.
      this.prisma.majorEventSubscription.groupBy({
        by: ['subscriptionStatus'],
        where: {
          deletedAt: null,
          lgpdDeletionRequestId: null,
          selectedEvents: { some: { eventId, event, deletedAt: null, lgpdDeletionRequestId: null } },
        },
        _count: { _all: true },
      }),
    ]);
    return {
      eventId,
      eventRegistrations: registrations.map((group) => ({
        creationMethod: group.createdByMethod,
        count: group._count._all,
      })),
      majorEventSelections: selections.map((group) => ({ status: group.subscriptionStatus, count: group._count._all })),
    };
  }

  async listEventForms(user: AuthenticatedUser, delegationId: string, eventId: string, offset = 0) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
      throw new BadRequestException('Página inválida.');
    }
    await this.access.assertToolAccess(user, delegationId, 'FORMS_READ', eventId);
    const forms = await this.prisma.eventForm.findMany({
      where: {
        ownerEventId: eventId,
        ownerMajorEventId: null,
        ownerEvent: { is: await this.eventWhere(user, eventId, Permission.EventForm.Read) },
        deletedAt: null,
      },
      select: { id: true, name: true, publicationState: true, responseMode: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: offset,
      take: 21,
    });
    return {
      eventId,
      coverage: 'event-owned-only',
      forms: forms.slice(0, 20),
      nextOffset: forms.length > 20 ? offset + 20 : null,
    };
  }

  async getEventContentReview(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'CONTENT_REVIEWS_READ', eventId);
    const review = await this.prisma.contentReview.findFirst({
      where: { eventId, personId: null, event: { is: await this.eventWhere(user, eventId, Permission.Event.Update) } },
      select: {
        id: true,
        eventId: true,
        personId: true,
        revision: true,
        updatedAt: true,
        changes: true,
        event: { select: { updatedAt: true } },
      },
    });
    if (!review) return { eventId, review: null };
    const changes = readChanges(review).filter((change) => change.kind === 'material');
    return {
      eventId,
      eventUpdatedAt: review.event?.updatedAt,
      review: {
        id: review.id,
        revision: review.revision,
        updatedAt: review.updatedAt,
        changes: changes.slice(0, 100).map((change) => ({
          key: change.key,
          before: change.before ? materialProjection(parseEventMaterials([change.before])[0]) : null,
          after: change.after ? materialProjection(parseEventMaterials([change.after])[0]) : null,
        })),
        truncated: changes.length > 100,
      },
      contentTrust: 'untrusted-user-content',
    };
  }

  private async eventWhere(
    user: AuthenticatedUser,
    eventId: string,
    permission: Permission,
  ): Promise<Prisma.EventWhereInput> {
    return {
      AND: [
        { id: eventId },
        await this.access.eventWhere(user, Permission.Event.Read),
        await this.access.eventWhere(user, permission),
      ],
    };
  }
}

function materialProjection(material: EventMaterial) {
  return { title: material.title, url: material.url, releaseAfterEvent: material.releaseAfterEvent ?? false };
}
