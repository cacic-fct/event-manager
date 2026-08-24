import { type FormElement } from '@cacic-fct/form-contracts';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, SportsBracketSide, SportsScoreEntrySource } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { normalizeAnswers } from '../../event-forms/event-form-answer-normalization';
import { SportsAdminLookupService } from './sports-admin-lookup.service';

export abstract class SportsAdminBaseService extends SportsAdminLookupService {
  protected async assertBackingEventGroupsHaveNoOrdinaryEvents(
    tx: Prisma.TransactionClient,
    eventGroupIds: string | readonly string[],
  ): Promise<void> {
    const ids = typeof eventGroupIds === 'string' ? [eventGroupIds] : [...eventGroupIds];
    if (ids.length === 0) {
      return;
    }

    const ordinaryEvent = await tx.event.findFirst({
      where: {
        eventGroupId: { in: ids },
        deletedAt: null,
        sportsMatch: null,
      },
      select: { id: true },
    });
    if (ordinaryEvent) {
      throw new ConflictException(
        'O grupo de eventos contém eventos comuns e não pode ser usado ou excluído como modalidade esportiva.',
      );
    }
  }

  protected async attachCompatibleEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    scope: {
      majorEventId: string;
      eventGroupId: string;
      name?: string;
      startDate?: Date;
      endDate?: Date;
      shouldIssueCertificate: boolean;
      venue: {
        name: string;
        courtLabel: string | null;
        placePreset: {
          latitude: number | null;
          longitude: number | null;
          locationDescription: string | null;
        };
      } | null;
    },
    actorId: string,
  ) {
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { sportsMatch: true },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }
    if (event.majorEventId !== scope.majorEventId || event.eventGroupId !== scope.eventGroupId) {
      throw new BadRequestException('O evento precisa pertencer ao mesmo grande evento e grupo da modalidade.');
    }
    if (event.sportsMatch) {
      throw new ConflictException('O evento selecionado já está vinculado a uma partida.');
    }
    if (event.allowSubscription) {
      throw new ConflictException('Um evento com inscrições próprias não pode ser convertido em partida.');
    }
    const startDate = scope.startDate ?? event.startDate;
    const endDate = scope.endDate ?? event.endDate;
    this.assertDateRange(startDate, endDate, 'partida');
    const name = scope.name === undefined ? event.name : this.requireText(scope.name, 'nome da partida', 2, 160);

    return tx.event.update({
      where: { id: event.id },
      data: {
        name,
        startDate,
        endDate,
        shouldCollectAttendance: true,
        shouldIssueCertificate: scope.shouldIssueCertificate,
        allowSubscription: false,
        ...(scope.venue
          ? {
              latitude: scope.venue.placePreset.latitude,
              longitude: scope.venue.placePreset.longitude,
              locationDescription: [
                scope.venue.placePreset.locationDescription,
                scope.venue.name,
                scope.venue.courtLabel,
              ]
                .filter(Boolean)
                .join(' · '),
            }
          : {}),
        updatedById: actorId,
      },
    });
  }

  protected async assertVenueParentChain(
    tx: Prisma.TransactionClient,
    venueId: string,
    parentVenueId: string,
    tournamentId: string,
  ): Promise<void> {
    const visited = new Set([venueId]);
    let currentId: string | null = parentVenueId;
    while (currentId) {
      if (visited.has(currentId)) {
        throw new BadRequestException('A hierarquia de locais não pode conter ciclos.');
      }
      visited.add(currentId);
      const current: { parentVenueId: string | null } | null = await tx.sportsVenue.findFirst({
        where: { id: currentId, tournamentId, deletedAt: null },
        select: { parentVenueId: true },
      });
      if (!current) {
        throw new BadRequestException('A hierarquia de locais contém um local inválido.');
      }
      currentId = current.parentVenueId;
    }
  }

  protected async assertRegistrationFormForMajorEvent(
    tx: Prisma.TransactionClient,
    formId: string | null | undefined,
    majorEventId: string,
  ): Promise<void> {
    if (!formId) {
      return;
    }
    const form = await tx.eventForm.findFirst({
      where: {
        id: formId,
        ownerMajorEventId: majorEventId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!form) {
      throw new BadRequestException('O formulário de inscrição precisa pertencer ao grande evento do torneio.');
    }
  }

  protected assertManualScoreEntry(input: {
    source: SportsScoreEntrySource;
    points: number;
    sourceMatchId?: string | null;
  }): void {
    if (input.source !== SportsScoreEntrySource.MANUAL && input.source !== SportsScoreEntrySource.PENALTY) {
      throw new BadRequestException('Ajustes administrativos devem ser manuais ou penalidades.');
    }
    if (input.sourceMatchId) {
      throw new BadRequestException('Ajustes administrativos não podem se passar por pontuação de partida.');
    }
    if (!Number.isInteger(input.points)) {
      throw new BadRequestException('A pontuação deve ser um número inteiro.');
    }
  }

  protected async assertOfficialScopeMutable(
    scope: {
      majorEventId: string;
      eventGroupId: string | null;
      eventId: string | null;
    },
    actor: AuthenticatedUser,
    operation: 'edit' | 'delete',
  ): Promise<void> {
    if (scope.eventId) {
      await this.frozen.assertEventMutable(scope.eventId, actor, operation);
      return;
    }
    if (scope.eventGroupId) {
      await this.frozen.assertEventGroupMutable(scope.eventGroupId, actor, operation);
      return;
    }
    await this.frozen.assertMajorEventMutable(scope.majorEventId, actor, operation);
  }

  protected buildRegistrationFormData(
    category: {
      registrationFormId: string | null;
      registrationForm: {
        id: string;
        name: string;
        elements: Prisma.JsonValue;
        updatedAt: Date;
        deletedAt: Date | null;
      } | null;
    },
    submittedAnswers: Prisma.InputJsonValue | null | undefined,
  ): {
    formAnswers?: Prisma.InputJsonValue;
    formSchemaSnapshot?: Prisma.InputJsonValue;
  } {
    if (!category.registrationFormId) {
      if (submittedAnswers !== undefined && submittedAnswers !== null) {
        throw new BadRequestException('A modalidade não possui formulário de inscrição configurado.');
      }
      return {};
    }
    const form = category.registrationForm;
    if (!form || form.deletedAt) {
      throw new BadRequestException('O formulário de inscrição configurado não está disponível.');
    }
    const elements = this.readFormElements(form.elements, 'O formulário de inscrição possui uma estrutura inválida.');
    const answers = normalizeAnswers(JSON.stringify(submittedAnswers ?? []), elements);
    return {
      formAnswers: answers as unknown as Prisma.InputJsonValue,
      formSchemaSnapshot: {
        version: 1,
        formId: form.id,
        name: form.name,
        elements: form.elements,
        capturedAt: new Date().toISOString(),
        sourceUpdatedAt: form.updatedAt.toISOString(),
      } as Prisma.InputJsonValue,
    };
  }

  protected normalizeRegistrationUpdateAnswers(
    snapshot: Prisma.JsonValue | null,
    submittedAnswers: Prisma.InputJsonValue | null,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (submittedAnswers === null && snapshot === null) {
      return Prisma.JsonNull;
    }
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new ConflictException(
        'A inscrição não possui um retrato válido do formulário. Recrie a inscrição antes de editar as respostas.',
      );
    }
    const elements = this.readFormElements(
      (snapshot as Record<string, Prisma.JsonValue>)['elements'],
      'O retrato do formulário da inscrição está inválido.',
    );
    return normalizeAnswers(JSON.stringify(submittedAnswers ?? []), elements) as unknown as Prisma.InputJsonValue;
  }

  protected readFormElements(value: Prisma.JsonValue | undefined, errorMessage: string): FormElement[] {
    if (!Array.isArray(value)) {
      throw new ConflictException(errorMessage);
    }
    return value as unknown as FormElement[];
  }

  protected async assertScoreEntryTargets(
    tx: Prisma.TransactionClient,
    tournamentId: string,
    teamId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    const [team, category] = await Promise.all([
      tx.sportsTeam.findFirst({
        where: { id: teamId, tournamentId, deletedAt: null },
        select: { id: true },
      }),
      categoryId
        ? tx.sportsCategory.findFirst({
            where: { id: categoryId, tournamentId, deletedAt: null },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (!team) {
      throw new BadRequestException('A equipe não pertence ao torneio informado.');
    }
    if (categoryId && !category) {
      throw new BadRequestException('A modalidade não pertence ao torneio informado.');
    }
  }

  protected async assertAdvancementTargets(
    tx: Prisma.TransactionClient,
    categoryId: string,
    sourceMatchId: string | null,
    targetIds: Array<string | null | undefined>,
  ): Promise<void> {
    const ids = [...new Set(targetIds.filter((id): id is string => Boolean(id)))];
    if (sourceMatchId && ids.includes(sourceMatchId)) {
      throw new BadRequestException('Uma partida não pode encaminhar resultado para ela mesma.');
    }
    if (ids.length === 0) {
      return;
    }
    const targets = await tx.sportsMatch.findMany({
      where: {
        id: { in: ids },
        categoryId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (targets.length !== ids.length) {
      throw new BadRequestException('As partidas de destino precisam pertencer à mesma modalidade.');
    }
    if (!sourceMatchId) {
      return;
    }
    for (const targetId of ids) {
      const visited = new Set<string>();
      const pending = [targetId];
      while (pending.length > 0) {
        const currentId = pending.pop();
        if (!currentId || visited.has(currentId)) {
          continue;
        }
        if (currentId === sourceMatchId) {
          throw new BadRequestException('O encaminhamento criaria um ciclo inválido na chave.');
        }
        visited.add(currentId);
        const current = await tx.sportsMatch.findFirst({
          where: {
            id: currentId,
            categoryId,
            deletedAt: null,
          },
          select: {
            winnerAdvancesToId: true,
            loserAdvancesToId: true,
          },
        });
        if (current?.winnerAdvancesToId) {
          pending.push(current.winnerAdvancesToId);
        }
        if (current?.loserAdvancesToId) {
          pending.push(current.loserAdvancesToId);
        }
      }
    }
  }

  protected assertAdvancementTargetPair(
    targetId: string | null | undefined,
    targetSide: SportsBracketSide | null | undefined,
    label: string,
  ): void {
    if (Boolean(targetId) !== Boolean(targetSide)) {
      throw new BadRequestException(`Informe a partida e o lado de destino para o encaminhamento de ${label}.`);
    }
  }
}
