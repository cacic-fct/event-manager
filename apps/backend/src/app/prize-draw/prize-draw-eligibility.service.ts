import { Injectable } from '@nestjs/common';
import {
  EventAttendanceStatus,
  Prisma,
  PrizeDrawChanceMode,
  PrizeDrawTargetType,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PrizeDrawEntrySource = 'ATTENDANCE' | 'SUBSCRIPTION' | 'MANUAL';

export type PrizeDrawEligibleRecord = {
  identityKey: string;
  personId: string | null;
  displayName: string;
  weight: number;
  sources: PrizeDrawEntrySource[];
};

export type PrizeDrawEligibilityConfig = {
  id: string;
  targetType: PrizeDrawTargetType;
  eventId: string | null;
  majorEventId: string | null;
  includePresent: boolean;
  includeSubscribers: boolean;
  includeManualEntries: boolean;
  chanceMode: PrizeDrawChanceMode;
  frozenAt: Date | null;
};

type EligibilityClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class PrizeDrawEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    draw: PrizeDrawEligibilityConfig,
    options: { excludeIdentityKeys?: ReadonlySet<string>; client?: EligibilityClient } = {},
  ): Promise<PrizeDrawEligibleRecord[]> {
    const client = options.client ?? this.prisma;
    const entries = draw.frozenAt
      ? await this.readFrozen(draw.id, client)
      : await this.buildCurrent(draw, client);
    const excluded = options.excludeIdentityKeys;
    return excluded?.size ? entries.filter((entry) => !excluded.has(entry.identityKey)) : entries;
  }

  async freeze(
    draw: PrizeDrawEligibilityConfig,
    frozenAt: Date,
    frozenById: string,
    client: Prisma.TransactionClient,
  ): Promise<PrizeDrawEligibleRecord[]> {
    const entries = await this.buildCurrent({ ...draw, frozenAt: null }, client);
    if (entries.length === 0) {
      return [];
    }
    await client.prizeDrawFrozenEntry.deleteMany({ where: { drawId: draw.id } });
    await client.prizeDrawFrozenEntry.createMany({
      data: entries.map((entry) => ({
        drawId: draw.id,
        identityKey: entry.identityKey,
        personId: entry.personId,
        displayName: entry.displayName,
        weight: entry.weight,
        sources: entry.sources,
      })),
    });
    await client.prizeDraw.update({
      where: { id: draw.id },
      data: {
        frozenAt,
        frozenById,
        unfrozenAt: null,
        revision: { increment: 1 },
      },
    });
    return entries;
  }

  private async buildCurrent(
    draw: PrizeDrawEligibilityConfig,
    client: EligibilityClient,
  ): Promise<PrizeDrawEligibleRecord[]> {
    const byIdentity = new Map<string, PrizeDrawEligibleRecord>();
    const addPerson = (person: { id: string; name: string }, source: PrizeDrawEntrySource) => {
      const identityKey = `person:${person.id}`;
      const existing = byIdentity.get(identityKey);
      if (existing) {
        if (!existing.sources.includes(source)) existing.sources.push(source);
        return existing;
      }
      const created: PrizeDrawEligibleRecord = {
        identityKey,
        personId: person.id,
        displayName: person.name.trim(),
        weight: 1,
        sources: [source],
      };
      byIdentity.set(identityKey, created);
      return created;
    };

    if (draw.includePresent) {
      const attendances = await client.eventAttendance.findMany({
        where: {
          status: EventAttendanceStatus.PRESENT,
          person: { deletedAt: null, mergedIntoId: null },
          event: this.eventTargetWhere(draw),
        },
        select: { person: { select: { id: true, name: true } } },
        distinct: ['personId'],
      });
      for (const attendance of attendances) addPerson(attendance.person, 'ATTENDANCE');
    }

    if (draw.includeSubscribers) {
      if (draw.targetType === PrizeDrawTargetType.EVENT && draw.eventId) {
        const [subscriptions, event] = await Promise.all([client.eventSubscription.findMany({
          where: {
            eventId: draw.eventId,
            deletedAt: null,
            person: { deletedAt: null, mergedIntoId: null },
          },
          select: { person: { select: { id: true, name: true } } },
        }), client.event.findUnique({
          where: { id: draw.eventId },
          select: { majorEventId: true, autoSubscribe: true, eventGroup: { select: { majorEventId: true } } },
        })]);
        for (const subscription of subscriptions) addPerson(subscription.person, 'SUBSCRIPTION');
        const majorEventId = event?.majorEventId ?? event?.eventGroup?.majorEventId;
        if (majorEventId) {
          const majorSubscriptions = await client.majorEventSubscription.findMany({
            where: {
              majorEventId,
              deletedAt: null,
              subscriptionStatus: SubscriptionStatus.CONFIRMED,
              person: { deletedAt: null, mergedIntoId: null },
              ...(event?.autoSubscribe
                ? {}
                : { selectedEvents: { some: { eventId: draw.eventId, deletedAt: null } } }),
            },
            select: { person: { select: { id: true, name: true } } },
          });
          for (const subscription of majorSubscriptions) addPerson(subscription.person, 'SUBSCRIPTION');
        }
      }
      if (draw.targetType === PrizeDrawTargetType.MAJOR_EVENT && draw.majorEventId) {
        const subscriptions = await client.majorEventSubscription.findMany({
          where: {
            majorEventId: draw.majorEventId,
            deletedAt: null,
            subscriptionStatus: SubscriptionStatus.CONFIRMED,
            person: { deletedAt: null, mergedIntoId: null },
          },
          select: { person: { select: { id: true, name: true } } },
        });
        for (const subscription of subscriptions) addPerson(subscription.person, 'SUBSCRIPTION');
      }
    }

    if (draw.includeManualEntries) {
      const manualEntries = await client.prizeDrawManualEntry.findMany({
        where: { drawId: draw.id },
        select: {
          id: true,
          name: true,
          weight: true,
          personId: true,
          person: {
            select: {
              id: true,
              name: true,
              deletedAt: true,
              mergedIntoId: true,
              mergedInto: { select: { id: true, name: true, deletedAt: true, mergedIntoId: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const manual of manualEntries) {
        const canonicalPerson = manual.person?.mergedInto ?? manual.person;
        if (canonicalPerson && !canonicalPerson.deletedAt && !canonicalPerson.mergedIntoId) {
          const entry = addPerson(canonicalPerson, 'MANUAL');
          if (draw.chanceMode === PrizeDrawChanceMode.WEIGHTED) entry.weight = manual.weight;
          continue;
        }
        if (manual.personId) continue;
        const name = manual.name.trim();
        if (!name) continue;
        byIdentity.set(`manual:${manual.id}`, {
          identityKey: `manual:${manual.id}`,
          personId: null,
          displayName: name,
          weight: draw.chanceMode === PrizeDrawChanceMode.WEIGHTED ? manual.weight : 1,
          sources: ['MANUAL'],
        });
      }
    }

    if (draw.chanceMode === PrizeDrawChanceMode.WEIGHTED) {
      const overrides = await client.prizeDrawWeightOverride.findMany({
        where: { drawId: draw.id },
        select: { personId: true, weight: true, person: { select: { mergedIntoId: true } } },
      });
      for (const override of overrides) {
        const entry = byIdentity.get(`person:${override.person.mergedIntoId ?? override.personId}`);
        if (entry) entry.weight = override.weight;
      }
    } else {
      for (const entry of byIdentity.values()) entry.weight = 1;
    }

    const excludedPeople = await client.prizeDrawExcludedPerson.findMany({
      where: { drawId: draw.id },
      select: {
        personId: true,
        person: { select: { mergedIntoId: true } },
      },
    });
    for (const exclusion of excludedPeople) {
      byIdentity.delete(`person:${exclusion.person.mergedIntoId ?? exclusion.personId}`);
    }

    return [...byIdentity.values()].sort(
      (left, right) => left.displayName.localeCompare(right.displayName, 'pt-BR') || left.identityKey.localeCompare(right.identityKey),
    );
  }

  private async readFrozen(drawId: string, client: EligibilityClient): Promise<PrizeDrawEligibleRecord[]> {
    const entries = await client.prizeDrawFrozenEntry.findMany({
      where: { drawId },
      orderBy: [{ displayName: 'asc' }, { identityKey: 'asc' }],
    });
    return entries.map((entry) => ({
      identityKey: entry.identityKey,
      personId: entry.personId,
      displayName: entry.displayName,
      weight: entry.weight,
      sources: entry.sources.filter(isPrizeDrawEntrySource),
    }));
  }

  private eventTargetWhere(draw: PrizeDrawEligibilityConfig): Prisma.EventWhereInput {
    if (draw.targetType === PrizeDrawTargetType.EVENT && draw.eventId) {
      return { id: draw.eventId, deletedAt: null };
    }
    if (draw.targetType === PrizeDrawTargetType.MAJOR_EVENT && draw.majorEventId) {
      return {
        deletedAt: null,
        OR: [
          { majorEventId: draw.majorEventId },
          { eventGroup: { majorEventId: draw.majorEventId, deletedAt: null } },
        ],
      };
    }
    return { id: '__invalid_prize_draw_target__' };
  }
}

function isPrizeDrawEntrySource(value: string): value is PrizeDrawEntrySource {
  return value === 'ATTENDANCE' || value === 'SUBSCRIPTION' || value === 'MANUAL';
}
