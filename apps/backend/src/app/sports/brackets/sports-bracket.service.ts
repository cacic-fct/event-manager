import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  SportsFormat,
  SportsRegistrationStatus,
  SportsStageType
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsBracketBasicPersistence } from './sports-bracket-basic-persistence';

export interface SportsBracketParticipant {
  registrationId: string;
  seed?: number | null;
}

@Injectable()
export class SportsBracketService extends SportsBracketBasicPersistence {
  async generate(
    input: {
      categoryId: string;
      participants: SportsBracketParticipant[];
      randomizeUnseeded?: boolean;
      randomSeed?: string | null;
      replaceExistingDraft?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const registrationIds = input.participants.map((item) => item.registrationId.trim());
    if (
      registrationIds.some((id) => !id) ||
      new Set(registrationIds).size !== registrationIds.length
    ) {
      throw new BadRequestException('As equipes da chave devem ser únicas e válidas.');
    }

    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const category = await tx.sportsCategory.findFirst({
        where: { id: input.categoryId, deletedAt: null },
        include: {
          eventGroup: true,
          tournament: { include: { majorEvent: true } },
          registrations: {
            where: {
              id: { in: registrationIds },
              deletedAt: null,
              status: {
                in: [
                  SportsRegistrationStatus.APPROVED,
                  SportsRegistrationStatus.ACTIVE,
                ],
              },
            },
            include: { team: { select: { name: true } } },
          },
          stages: {
            where: { deletedAt: null },
            include: {
              matches: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  eventId: true,
                  state: true,
                  operationSequence: true,
                  event: { select: { publicationState: true } },
                },
              },
            },
          },
        },
      });
      if (!category) {
        throw new NotFoundException(`Sports category ${input.categoryId} was not found.`);
      }
      await this.frozen.assertEventGroupMutable(
        category.eventGroupId,
        actor,
        'edit',
      );
      if (category.registrations.length !== registrationIds.length) {
        throw new BadRequestException(
          'Uma ou mais equipes não estão aprovadas nesta modalidade.',
        );
      }
      const generationKey = this.generationKey(category, input);
      if (
        category.stages.length > 0 &&
        category.stages.every(
          (stage) =>
            this.readRecord(stage.settings)['generationKey'] === generationKey,
        )
      ) {
        const stages = await this.loadGeneratedStages(
          tx,
          category.stages.map((stage) => stage.id),
        );
        return {
          stages,
          invalidations: [
            this.generationInvalidation(
              'BRACKET_GENERATED',
              category.tournament.id,
              category.id,
              stages,
            ),
          ],
        };
      }
      await this.replaceDraftIfRequested(
        tx,
        category.stages,
        Boolean(input.replaceExistingDraft),
        actorId,
      );
      if (
        !input.replaceExistingDraft &&
        category.stages.length > 0
      ) {
        throw new ConflictException(
          'A modalidade já possui uma chave. Confirme a substituição do rascunho.',
        );
      }

      const teamNameByRegistration = new Map(
        category.registrations.map((registration) => [
          registration.id,
          registration.team.name,
        ]),
      );
      let stageIds: string[];
      switch (category.format) {
        case SportsFormat.SINGLE_ELIMINATION:
          stageIds = [
            await this.persistSingleElimination(
              tx,
              category,
              input,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.ROUND_ROBIN:
          stageIds = [
            await this.persistRoundRobin(
              tx,
              category,
              registrationIds,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.GROUP_STAGE_ELIMINATION:
          stageIds = await this.persistGroupStageElimination(
            tx,
            category,
            input.participants,
            teamNameByRegistration,
            actorId,
          );
          break;
        case SportsFormat.DOUBLE_ELIMINATION:
          stageIds = await this.persistDoubleElimination(
            tx,
            category,
            input,
            teamNameByRegistration,
            actorId,
          );
          break;
        case SportsFormat.SWISS:
          stageIds = [
            await this.persistInitialSwissRound(
              tx,
              category,
              input.participants,
              teamNameByRegistration,
              actorId,
            ),
          ];
          break;
        case SportsFormat.CUSTOM:
          stageIds = [
            (
              await tx.sportsStage.create({
                data: {
                  categoryId: category.id,
                  name: 'Etapa personalizada',
                  type: SportsStageType.FINAL,
                  displayOrder: 1,
                  settings: { format: SportsFormat.CUSTOM },
                  createdById: actorId,
                  updatedById: actorId,
                },
              })
            ).id,
          ];
          break;
      }
      const generatedStages = await tx.sportsStage.findMany({
        where: { id: { in: stageIds } },
        select: { id: true, settings: true },
      });
      for (const stage of generatedStages) {
        await tx.sportsStage.update({
          where: { id: stage.id },
          data: {
            settings: this.toJson({
              ...this.readRecord(stage.settings),
              generationKey,
            }),
          },
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_CATEGORY,
          entityId: category.id,
          entityLabel: category.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          after: {
            format: category.format,
            stageIds,
            participantCount: registrationIds.length,
          },
          summary: 'Chave esportiva gerada.',
          scope: {
            majorEventId: category.tournament.majorEventId,
            eventGroupId: category.eventGroupId,
          },
          force: true,
        },
        tx,
      );
      const stages = await this.loadGeneratedStages(tx, stageIds);
      return {
        stages,
        invalidations: [
          this.generationInvalidation(
            'BRACKET_GENERATED',
            category.tournament.id,
            category.id,
            stages,
          ),
        ],
      };
    });
    await this.realtime.publishStructuralInvalidations(result.invalidations);
    return result.stages;
  }

}
