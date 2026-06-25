import { EventAttendance, EventAttendanceCsvImportInput, EventAttendanceCsvImportResult } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, GraphqlContext } from './event-attendances.shared';

@Resolver(() => EventAttendance)
export class EventAttendanceCsvImportResolver extends EventAttendancesResolverBase {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Mutation(() => EventAttendanceCsvImportResult, {
    name: 'importEventAttendancesFromCsv',
  })
  @RequirePermissions(Permission.EventAttendance.Import)
  async importEventAttendancesFromCsv(
    @Args('input', { type: () => EventAttendanceCsvImportInput })
    input: EventAttendanceCsvImportInput,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceCsvImportResult> {
    await this.frozenResources.assertEventMutable(input.eventId, context.req?.user ?? context.request?.user, 'edit');
    const event = await this.prisma.event.findFirst({
      where: {
        id: input.eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${input.eventId} was not found.`);
    }

    const { headers, rows } = this.parseCsv(input.csvContent);
    if (!headers.includes(input.selectedHeader)) {
      throw new BadRequestException(`CSV header "${input.selectedHeader}" was not found.`);
    }

    const rawValues = rows.map((row) => row[input.selectedHeader]?.trim() ?? '').filter((value) => value.length > 0);
    const uniqueRawValues = Array.from(new Set(rawValues));
    const inferredMatchType = this.inferMatchType(uniqueRawValues);
    const personByValue = await this.findPeopleByImportValues(uniqueRawValues, inferredMatchType);

    const existingAttendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: input.eventId,
      },
      select: {
        personId: true,
      },
    });
    const existingPersonIds = new Set(existingAttendances.map((attendance) => attendance.personId));

    const failedValues: string[] = [];
    let duplicateCount = 0;
    const personIdsToCreate = new Set<string>();

    for (const rawValue of rawValues) {
      const normalizedValue = this.normalizeImportValue(rawValue, inferredMatchType);
      const person = personByValue.get(normalizedValue);
      if (!person) {
        if (!failedValues.includes(rawValue)) {
          failedValues.push(rawValue);
        }
        continue;
      }

      if (existingPersonIds.has(person.id) || personIdsToCreate.has(person.id)) {
        duplicateCount += 1;
        continue;
      }

      personIdsToCreate.add(person.id);
    }

    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
    const createdPersonIds = Array.from(personIdsToCreate);
    const createResult =
      createdPersonIds.length > 0
        ? await this.prisma.$transaction(async (tx) => {
            const result = await tx.eventAttendance.createMany({
              data: createdPersonIds.map((personId) => ({
                personId,
                eventId: input.eventId,
                createdById,
                committedById: createdById,
                createdByMethod: AttendanceCreationMethod.CSV_IMPORT,
              })),
              skipDuplicates: true,
            });
            await this.attendanceCategories.refreshForEventPersons([input.eventId], createdPersonIds, tx);
            return result;
          })
        : { count: 0 };

    return {
      createdCount: createResult.count,
      duplicateCount,
      failedCount: failedValues.length,
      failedValues,
      inferredMatchType,
    };
  }
}
