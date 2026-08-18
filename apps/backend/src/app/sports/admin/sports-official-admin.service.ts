import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma, SportsOfficialRole } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsAdminBaseService } from './sports-admin-base.service';

type SportsOfficialScope = {
  categoryId: string | null;
  matchId: string | null;
};

export class SportsOfficialAdminService extends SportsAdminBaseService {
  async assignOfficial(
    input: {
      tournamentId: string;
      categoryId?: string | null;
      matchId?: string | null;
      personId: string;
      role: SportsOfficialRole;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [tournament, person] = await Promise.all([
        tx.sportsTournament.findFirst({
          where: { id: input.tournamentId, deletedAt: null },
          select: { majorEventId: true },
        }),
        tx.people.findFirst({
          where: { id: input.personId, deletedAt: null },
          select: { id: true, name: true, userId: true },
        }),
      ]);
      if (!tournament || !person) {
        throw new NotFoundException('Torneio ou pessoa não encontrada.');
      }
      if (!person.userId) {
        throw new BadRequestException('A pessoa designada precisa possuir uma conta vinculada.');
      }
      let eventGroupId: string | null = null;
      let eventId: string | null = null;
      let matchCategoryId: string | null = null;
      if (input.categoryId) {
        const category = await tx.sportsCategory.findFirst({
          where: {
            id: input.categoryId,
            tournamentId: input.tournamentId,
            deletedAt: null,
          },
        });
        if (!category) {
          throw new BadRequestException('A modalidade não pertence ao torneio.');
        }
        eventGroupId = category.eventGroupId;
      }
      if (input.matchId) {
        const match = await tx.sportsMatch.findFirst({
          where: {
            id: input.matchId,
            category: {
              tournamentId: input.tournamentId,
            },
            deletedAt: null,
          },
          select: {
            categoryId: true,
            eventId: true,
            category: { select: { eventGroupId: true } },
          },
        });
        if (!match || (input.categoryId && match.categoryId !== input.categoryId)) {
          throw new BadRequestException('A partida não pertence ao escopo selecionado.');
        }
        eventId = match.eventId;
        matchCategoryId = match.categoryId;
        eventGroupId = match.category.eventGroupId;
      }
      await this.assertOfficialScopeMutable(
        {
          majorEventId: tournament.majorEventId,
          eventGroupId,
          eventId,
        },
        actor,
        'edit',
      );

      const existing = await tx.sportsOfficialAssignment.findFirst({
        where: {
          tournamentId: input.tournamentId,
          categoryId: input.categoryId ?? null,
          matchId: input.matchId ?? null,
          personId: input.personId,
          role: input.role,
        },
      });
      await this.assertSingleRolePerMatch(tx, {
        tournamentId: input.tournamentId,
        personId: input.personId,
        role: input.role,
        scope: this.toOfficialScope(input.categoryId ?? null, input.matchId ?? null, matchCategoryId),
        excludeId: existing?.id,
      });
      const assignment = existing
        ? await tx.sportsOfficialAssignment.update({
            where: { id: existing.id },
            data: {
              active: true,
              assignedAt: new Date(),
              assignedById: actorId,
              revokedAt: null,
              revokedById: null,
              revision: { increment: 1 },
            },
          })
        : await tx.sportsOfficialAssignment.create({
            data: {
              tournamentId: input.tournamentId,
              categoryId: input.categoryId ?? null,
              matchId: input.matchId ?? null,
              personId: input.personId,
              role: input.role,
              assignedById: actorId,
            },
          });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: assignment.id,
          entityLabel: `${person.name} · ${input.role}`,
          operation: AuditLogOperation.ASSIGN,
          actor,
          after: {
            personId: person.id,
            role: input.role,
            categoryId: input.categoryId ?? null,
            matchId: input.matchId ?? null,
          },
          summary: 'Responsável de partida designado.',
          scope: { majorEventId: tournament.majorEventId },
        },
        tx,
      );
      return assignment;
    });
  }

  async updateOfficial(
    assignmentId: string,
    input: {
      expectedRevision: number;
      role?: SportsOfficialRole;
      active?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        tournament: { select: { majorEventId: true } },
        category: { select: { eventGroupId: true } },
        match: { select: { eventId: true, categoryId: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException(`Sports official assignment ${assignmentId} was not found.`);
    }
    await this.assertOfficialScopeMutable(
      {
        majorEventId: assignment.tournament.majorEventId,
        eventGroupId: assignment.category?.eventGroupId ?? null,
        eventId: assignment.match?.eventId ?? null,
      },
      actor,
      'edit',
    );
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const active = input.active ?? assignment.active;
      const statusChanged = active !== assignment.active;
      if (active) {
        await this.assertSingleRolePerMatch(tx, {
          tournamentId: assignment.tournamentId,
          personId: assignment.personId,
          role: input.role ?? assignment.role,
          scope: this.toOfficialScope(
            assignment.categoryId ?? null,
            assignment.matchId ?? null,
            assignment.match?.categoryId ?? null,
          ),
          excludeId: assignment.id,
        });
      }
      const changed = await tx.sportsOfficialAssignment.updateMany({
        where: {
          id: assignment.id,
          revision: input.expectedRevision,
        },
        data: {
          ...(input.role !== undefined ? { role: input.role } : {}),
          active,
          ...(statusChanged && active
            ? { revokedAt: null, revokedById: null, assignedAt: new Date() }
            : statusChanged
              ? { revokedAt: new Date(), revokedById: actorId }
              : {}),
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A atribuição do responsável mudou. Recarregue e tente novamente.');
      }
      const result = await tx.sportsOfficialAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: result.id,
          entityLabel: result.id,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: this.officialAuditSnapshot(assignment),
          after: this.officialAuditSnapshot(result),
          summary: active ? 'Atribuição de responsável atualizada.' : 'Responsável removido da partida.',
          scope: { majorEventId: assignment.tournament.majorEventId },
        },
        tx,
      );
      return result;
    });
  }

  async deleteOfficial(assignmentId: string, expectedRevision: number, actor: AuthenticatedUser): Promise<void> {
    const actorId = this.requireActorId(actor);
    const assignment = await this.prisma.sportsOfficialAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        tournament: { select: { majorEventId: true } },
        category: { select: { eventGroupId: true } },
        match: { select: { eventId: true, categoryId: true } },
      },
    });
    if (!assignment) {
      throw new NotFoundException(`Sports official assignment ${assignmentId} was not found.`);
    }
    await this.assertOfficialScopeMutable(
      {
        majorEventId: assignment.tournament.majorEventId,
        eventGroupId: assignment.category?.eventGroupId ?? null,
        eventId: assignment.match?.eventId ?? null,
      },
      actor,
      'delete',
    );
    await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const revokedAt = new Date();
      const changed = await tx.sportsOfficialAssignment.updateMany({
        where: {
          id: assignmentId,
          revision: expectedRevision,
          active: true,
        },
        data: {
          active: false,
          revokedAt,
          revokedById: actorId,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new ConflictException('A atribuição do responsável mudou. Recarregue e tente novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_OFFICIAL_ASSIGNMENT,
          entityId: assignment.id,
          entityLabel: assignment.id,
          operation: AuditLogOperation.DELETE,
          actor,
          before: this.officialAuditSnapshot(assignment),
          after: {
            ...this.officialAuditSnapshot(assignment),
            active: false,
            revokedAt,
          },
          summary: 'Responsável esportivo removido.',
          scope: {
            permission: Permission.SportsOfficial.Delete,
            majorEventId: assignment.tournament.majorEventId,
          },
          force: true,
        },
        tx,
      );
    });
  }

  private async assertSingleRolePerMatch(
    tx: Prisma.TransactionClient,
    input: {
      tournamentId: string;
      personId: string;
      role: SportsOfficialRole;
      scope: SportsOfficialScope;
      excludeId?: string;
    },
  ): Promise<void> {
    const assignments = await tx.sportsOfficialAssignment.findMany({
      where: {
        tournamentId: input.tournamentId,
        personId: input.personId,
        active: true,
        revokedAt: null,
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
      },
      select: {
        id: true,
        categoryId: true,
        matchId: true,
        role: true,
        match: { select: { categoryId: true } },
      },
    });
    const conflictingAssignment = assignments.find(
      (assignment) =>
        assignment.role !== input.role &&
        this.officialScopesOverlap(
          input.scope,
          this.toOfficialScope(assignment.categoryId, assignment.matchId, assignment.match?.categoryId ?? null),
        ),
    );
    if (conflictingAssignment) {
      throw new ConflictException('A pessoa não pode ter mais de uma função na mesma partida.');
    }
  }

  private toOfficialScope(
    categoryId: string | null,
    matchId: string | null,
    matchCategoryId: string | null,
  ): SportsOfficialScope {
    return {
      categoryId: matchId ? categoryId ?? matchCategoryId : categoryId,
      matchId,
    };
  }

  private officialScopesOverlap(left: SportsOfficialScope, right: SportsOfficialScope): boolean {
    if (left.matchId && right.matchId) {
      return left.matchId === right.matchId;
    }
    if (left.matchId || right.matchId) {
      const matchScope = left.matchId ? left : right;
      const broaderScope = left.matchId ? right : left;
      return broaderScope.categoryId === null || broaderScope.categoryId === matchScope.categoryId;
    }
    return left.categoryId === null || right.categoryId === null || left.categoryId === right.categoryId;
  }
}
