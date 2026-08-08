import { Permission } from '@cacic-fct/shared-permissions';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  SportsMatchState
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsAdminBaseService } from './sports-admin-base.service';

export class SportsVenueAdminService extends SportsAdminBaseService {
  async createVenue(
    input: {
      tournamentId: string;
      placePresetId: string;
      name: string;
      courtLabel?: string | null;
      capacity?: number | null;
      notes?: string | null;
      parentVenueId?: string | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    if (
      input.capacity !== undefined &&
      input.capacity !== null &&
      (!Number.isInteger(input.capacity) || input.capacity < 0)
    ) {
      throw new BadRequestException('A capacidade deve ser um número inteiro não negativo.');
    }
    const scope = await this.prisma.sportsTournament.findFirst({
      where: { id: input.tournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!scope) {
      throw new NotFoundException(`Sports tournament ${input.tournamentId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(scope.majorEventId, actor, 'edit');

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [tournament, place] = await Promise.all([
        tx.sportsTournament.findFirst({
          where: { id: input.tournamentId, deletedAt: null },
          select: { majorEventId: true },
        }),
        tx.placePreset.findFirst({
          where: { id: input.placePresetId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (!tournament || !place) {
        throw new NotFoundException('Torneio ou local não encontrado.');
      }
      if (input.parentVenueId) {
        const parent = await tx.sportsVenue.findFirst({
          where: {
            id: input.parentVenueId,
            tournamentId: input.tournamentId,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!parent) {
          throw new BadRequestException('O local pai não pertence ao torneio.');
        }
      }
      const venue = await tx.sportsVenue.create({
        data: {
          tournamentId: input.tournamentId,
          placePresetId: input.placePresetId,
          name: this.requireText(input.name, 'nome do local', 2, 120),
          courtLabel: input.courtLabel?.trim() || null,
          capacity: input.capacity ?? null,
          notes: input.notes?.trim() || null,
          parentVenueId: input.parentVenueId ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: venue.id,
          entityLabel: venue.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: venue,
          summary: 'Local esportivo criado.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: tournament.majorEventId,
          },
        },
        tx,
      );
      return venue;
    });
  }

  async updateVenue(
    venueId: string,
    input: {
      tournamentId: string;
      expectedRevision: number;
      placePresetId?: string;
      name?: string;
      courtLabel?: string | null;
      capacity?: number | null;
      notes?: string | null;
      parentVenueId?: string | null;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const existing = await this.prisma.sportsVenue.findFirst({
      where: { id: venueId, deletedAt: null },
      include: {
        tournament: { select: { majorEventId: true } },
      },
    });
    if (!existing) {
      throw new NotFoundException(`Sports venue ${venueId} was not found.`);
    }
    if (existing.tournamentId !== input.tournamentId) {
      throw new BadRequestException('O local não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(
      existing.tournament.majorEventId,
      actor,
      'edit',
    );

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      if (input.placePresetId !== undefined) {
        const place = await tx.placePreset.findFirst({
          where: { id: input.placePresetId, deletedAt: null },
          select: { id: true },
        });
        if (!place) {
          throw new NotFoundException('Local base não encontrado.');
        }
      }
      if (input.parentVenueId !== undefined && input.parentVenueId !== null) {
        if (input.parentVenueId === venueId) {
          throw new BadRequestException('Um local não pode ser pai dele mesmo.');
        }
        const parent = await tx.sportsVenue.findFirst({
          where: {
            id: input.parentVenueId,
            tournamentId: existing.tournamentId,
            deletedAt: null,
          },
          select: {
            id: true,
            parentVenueId: true,
          },
        });
        if (!parent) {
          throw new BadRequestException('O local pai não pertence ao torneio.');
        }
        await this.assertVenueParentChain(
          tx,
          venueId,
          parent.id,
          existing.tournamentId,
        );
      }
      if (
        input.capacity !== undefined &&
        input.capacity !== null &&
        (!Number.isInteger(input.capacity) || input.capacity < 0)
      ) {
        throw new BadRequestException('A capacidade deve ser um número inteiro não negativo.');
      }
      const name =
        input.name === undefined
          ? undefined
          : this.requireText(input.name, 'nome do local', 2, 120);
      const updated = await tx.sportsVenue.updateMany({
        where: {
          id: venueId,
          revision: input.expectedRevision,
          deletedAt: null,
        },
        data: {
          ...(input.placePresetId !== undefined
            ? { placePresetId: input.placePresetId }
            : {}),
          ...(name !== undefined ? { name } : {}),
          ...(input.courtLabel !== undefined
            ? { courtLabel: input.courtLabel?.trim() || null }
            : {}),
          ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          ...(input.notes !== undefined
            ? { notes: input.notes?.trim() || null }
            : {}),
          ...(input.parentVenueId !== undefined
            ? { parentVenueId: input.parentVenueId }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException('O local mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsVenue.findUniqueOrThrow({
        where: { id: venueId },
        include: { placePreset: true },
      });

      if (
        input.placePresetId !== undefined ||
        input.name !== undefined ||
        input.courtLabel !== undefined
      ) {
        await tx.event.updateMany({
          where: {
            deletedAt: null,
            sportsMatch: {
              is: {
                venueId,
                deletedAt: null,
              },
            },
          },
          data: {
            latitude: result.placePreset.latitude,
            longitude: result.placePreset.longitude,
            locationDescription: [
              result.placePreset.locationDescription,
              result.name,
              result.courtLabel,
            ]
              .filter(Boolean)
              .join(' · '),
            updatedById: actorId,
          },
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: result.id,
          entityLabel: result.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: existing,
          after: result,
          summary: 'Local esportivo atualizado.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: existing.tournament.majorEventId,
          },
        },
        tx,
      );
      return result;
    });
  }


  async deleteVenue(
    venueId: string,
    expectedRevision: number,
    actor: AuthenticatedUser,
    expectedTournamentId: string,
  ): Promise<void> {
    const actorId = this.requireActorId(actor);
    const venue = await this.prisma.sportsVenue.findFirst({
      where: { id: venueId, deletedAt: null },
      include: { tournament: { select: { majorEventId: true } } },
    });
    if (!venue) {
      throw new NotFoundException(`Sports venue ${venueId} was not found.`);
    }
    if (venue.tournamentId !== expectedTournamentId) {
      throw new BadRequestException('O local não pertence ao torneio informado.');
    }
    await this.frozen.assertMajorEventMutable(venue.tournament.majorEventId, actor, 'delete');

    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [activeMatch, childVenue] = await Promise.all([
        tx.sportsMatch.findFirst({
          where: {
            venueId,
            deletedAt: null,
            state: {
              notIn: [
                SportsMatchState.FINISHED,
                SportsMatchState.DRAW,
                SportsMatchState.CANCELED,
              ],
            },
          },
          select: { id: true },
        }),
        tx.sportsVenue.findFirst({
          where: { parentVenueId: venueId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      if (activeMatch) {
        throw new ConflictException(
          'O local possui uma partida em aberto. Altere a partida primeiro.',
        );
      }
      if (childVenue) {
        throw new ConflictException(
          'O local possui subdivisões ativas. Remova ou mova-as primeiro.',
        );
      }
      const deletedAt = new Date();
      const changed = await tx.sportsVenue.updateMany({
        where: { id: venueId, revision: expectedRevision, deletedAt: null },
        data: { deletedAt, revision: { increment: 1 }, updatedById: actorId },
      });
      if (changed.count !== 1) {
        throw new ConflictException('O local mudou. Recarregue e tente novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_VENUE,
          entityId: venue.id,
          entityLabel: venue.name,
          operation: AuditLogOperation.DELETE,
          actor,
          before: venue,
          after: { ...venue, deletedAt },
          summary: 'Local esportivo excluído.',
          scope: {
            permission: Permission.SportsTournament.Update,
            majorEventId: venue.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }

}
