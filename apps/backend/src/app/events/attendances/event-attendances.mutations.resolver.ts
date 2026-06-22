import {
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, EVENT_RELATION_SELECT, GraphqlContext } from './event-attendances.shared';

@Resolver(() => EventAttendance)
export class EventAttendancesMutationsResolver extends EventAttendancesResolverBase {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
      buildCompositeEntityId: (parts: readonly string[]) => parts.join(':'),
    } as unknown as AuditLogService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Mutation(() => EventAttendance, { name: 'createEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendance(
    @Args('input', { type: () => EventAttendanceCreateInput })
    input: EventAttendanceCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    try {
      const attendance = await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            personId: input.personId,
            eventId: input.eventId,
            attendedAt: input.attendedAt,
            createdById,
            createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: input.personId,
              eventId: input.eventId,
            },
          },
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
          },
        });
        await this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada manualmente pelo painel administrativo.',
          tx,
        );
        return attendance;
      });
      return attendance;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromAztecCode',
  })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromAztecCode(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('code', { type: () => String }) code: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    const userId = this.parseUserAztecCode(code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    try {
      const attendance = await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId,
            personId: person.id,
            createdById,
            createdByMethod: AttendanceCreationMethod.SCANNER,
          },
        });
        await this.attendanceCategories.refreshForAttendance(person.id, eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: person.id,
              eventId,
            },
          },
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
          },
        });
        await this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada por leitura de código no painel administrativo.',
          tx,
        );
        return attendance;
      });
      return attendance;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromScannerCode',
  })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const userId = this.parseUserAztecCode(input.code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: this.getActorId(context),
        location: input.location,
      },
      (attendance, tx) => this.recordAttendanceCreate(attendance, context, 'Presença registrada pelo scanner.', tx),
    );
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromManualInput',
  })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromManualInput(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: this.getActorId(context),
        location: input.location,
      },
      (attendance, tx) => this.recordAttendanceCreate(attendance, context, 'Presença registrada por entrada manual.', tx),
    );
  }


  @Mutation(() => EventAttendance, { name: 'updateEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async updateEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('input', { type: () => EventAttendanceUpdateInput })
    input: EventAttendanceUpdateInput,
    @Context() context?: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    return this.prisma.$transaction(async (tx) => {
      const previousAttendance = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId, eventId } },
      });
      if (!previousAttendance) throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
      await tx.eventAttendance.update({
        where: { personId_eventId: { personId, eventId } },
        data: this.buildEventAttendanceUpdateData(input),
      });
      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);
      const attendance = await tx.eventAttendance.findUniqueOrThrow({
        where: { personId_eventId: { personId, eventId } },
        select: {
          personId: true,
          eventId: true,
          attendedAt: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
          category: true,
          person: true,
          event: { select: EVENT_RELATION_SELECT },
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: this.auditLog.buildCompositeEntityId([personId, eventId]),
          entityLabel: attendance.person?.name ?? personId,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: previousAttendance,
          after: attendance,
          scope: { permission: Permission.EventAttendance.Update, eventId },
          summary: 'Presença atualizada.',
        },
        tx,
      );
      return attendance;
    });
  }

  private buildEventAttendanceUpdateData(
    input: EventAttendanceUpdateInput,
  ): Prisma.EventAttendanceUncheckedUpdateManyInput {
    const data: Prisma.EventAttendanceUncheckedUpdateManyInput = {};

    if (input.attendedAt !== undefined) data.attendedAt = input.attendedAt;

    return data;
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Delete)
  async deleteEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context?: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'delete');
    await this.prisma.$transaction(async (tx) => {
      const previousAttendance = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId, eventId } },
      });
      if (!previousAttendance) throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
      await tx.eventAttendance.delete({ where: { personId_eventId: { personId, eventId } } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: this.auditLog.buildCompositeEntityId([personId, eventId]),
          entityLabel: personId,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: previousAttendance,
          after: {},
          scope: { permission: Permission.EventAttendance.Delete, eventId },
          summary: 'Presença removida.',
          force: true,
        },
        tx,
      );
    });

    return {
      deleted: true,
      personId,
      eventId,
    };
  }

  private getUser(context: GraphqlContext | undefined) {
    return context?.req?.user ?? context?.request?.user;
  }

  private async recordAttendanceCreate(
    attendance: {
      personId: string;
      eventId: string;
      person?: { name?: string | null } | null;
    },
    context: GraphqlContext,
    summary: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: this.auditLog.buildCompositeEntityId([attendance.personId, attendance.eventId]),
      entityLabel: attendance.person?.name ?? attendance.personId,
      operation: AuditLogOperation.CREATE,
      actor: this.getUser(context),
      after: attendance,
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: attendance.eventId,
      },
      summary,
    }, prisma);
  }
}
