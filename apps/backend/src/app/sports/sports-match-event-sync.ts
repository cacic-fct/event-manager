import { Prisma, PublicationState } from '@prisma/client';

interface SportsMatchEventVenue {
  name: string;
  courtLabel: string | null;
  placePreset: {
    name?: string;
    internalNotes?: string | null;
    latitude: number | null;
    longitude: number | null;
    locationDescription: string | null;
  };
}

function sportsMatchLocation(venue: SportsMatchEventVenue | null | undefined) {
  return venue
    ? {
        latitude: venue.placePreset.latitude,
        longitude: venue.placePreset.longitude,
        locationName: venue.placePreset.name ?? null,
        locationInternalNotes: venue.placePreset.internalNotes ?? null,
        isVirtual: false,
        locationDescription: [venue.placePreset.locationDescription, venue.name, venue.courtLabel]
          .filter(Boolean)
          .join(', '),
      }
    : {
        latitude: null,
        longitude: null,
        locationDescription: null,
        locationName: null,
        locationInternalNotes: null,
        isVirtual: false,
      };
}

export function createSportsMatchBackingEvent(
  tx: Prisma.TransactionClient,
  input: {
    id?: string;
    name: string;
    emoji: string;
    startDate: Date;
    endDate: Date;
    majorEventId: string;
    eventGroupId: string;
    venue?: SportsMatchEventVenue | null;
    isPubliclyListed: boolean;
    shouldIssueCertificate?: boolean;
    publicationState?: PublicationState;
    publishedAt?: Date | null;
    actorId: string;
  },
) {
  return tx.event.create({
    data: {
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      emoji: input.emoji,
      startDate: input.startDate,
      endDate: input.endDate,
      type: 'OTHER',
      majorEventId: input.majorEventId,
      eventGroupId: input.eventGroupId,
      ...sportsMatchLocation(input.venue),
      allowSubscription: false,
      shouldCollectAttendance: true,
      shouldIssueCertificate: input.shouldIssueCertificate ?? false,
      isPubliclyListed: input.isPubliclyListed,
      publicationState: input.publicationState ?? PublicationState.DRAFT,
      publishedAt: input.publishedAt ?? null,
      createdById: input.actorId,
      updatedById: input.actorId,
    },
  });
}

export function updateSportsMatchBackingEvent(
  tx: Prisma.TransactionClient,
  eventId: string,
  input: {
    name?: string;
    startDate: Date;
    endDate: Date;
    venue?: SportsMatchEventVenue | null;
    venueChanged: boolean;
    youtubeCode?: string | null;
    twitchChannel?: string | null;
    livestreamChanged: boolean;
    actorId: string;
  },
) {
  return tx.event.update({
    where: { id: eventId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      startDate: input.startDate,
      endDate: input.endDate,
      ...(input.venueChanged ? sportsMatchLocation(input.venue) : {}),
      ...(input.livestreamChanged
        ? {
            youtubeCode: input.youtubeCode ?? null,
            twitchChannel: input.twitchChannel ?? null,
          }
        : {}),
      updatedById: input.actorId,
    },
  });
}

export function softDeleteSportsMatchBackingEvents(
  tx: Prisma.TransactionClient,
  eventIds: string | string[],
  deletedAt: Date,
  actorId: string,
) {
  return tx.event.updateMany({
    where: {
      id: Array.isArray(eventIds) ? { in: eventIds } : eventIds,
      deletedAt: null,
    },
    data: { deletedAt, updatedById: actorId },
  });
}

export async function syncSportsMatchEventName(
  tx: Prisma.TransactionClient,
  matchId: string,
  actorId: string,
): Promise<void> {
  const match = await tx.sportsMatch.findUniqueOrThrow({
    where: { id: matchId },
    select: {
      eventId: true,
      category: { select: { name: true } },
      homeRegistration: {
        select: { team: { select: { name: true } } },
      },
      awayRegistration: {
        select: { team: { select: { name: true } } },
      },
    },
  });
  const homeName = match.homeRegistration?.team.name ?? 'A definir';
  const awayName = match.awayRegistration?.team.name ?? 'A definir';
  await tx.event.update({
    where: { id: match.eventId },
    data: {
      name: `${match.category.name} — ${homeName} x ${awayName}`,
      updatedById: actorId,
    },
  });
}
