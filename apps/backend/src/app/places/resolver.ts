import {
  DeletionResult,
  PlacePreset,
  PlacePresetCreateInput,
  PlacePresetUpdateInput,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

const PLACE_PRESET_SELECT = {
  id: true,
  name: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.PlacePresetSelect;

@Resolver(() => PlacePreset)
export class PlacePresetsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
  ) {}

  @Query(() => [PlacePreset], { name: 'placePresets' })
  @RequirePermissions(Permission.PlacePreset.Read)
  async placePresets(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const normalizedQuery = query?.trim();
    const where: Prisma.PlacePresetWhereInput = {
      deletedAt: null,
      ...(normalizedQuery
        ? {
            OR: [
              { name: { contains: normalizedQuery, mode: 'insensitive' } },
              { locationDescription: { contains: normalizedQuery, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.placePreset.findMany({
      where,
      select: PLACE_PRESET_SELECT,
      orderBy: {
        name: 'asc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  @Query(() => PlacePreset, { name: 'placePreset' })
  @RequirePermissions(Permission.PlacePreset.Read)
  async placePreset(@Args('id', { type: () => String }) id: string) {
    const place = await this.prisma.placePreset.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: PLACE_PRESET_SELECT,
    });

    if (!place) {
      throw new NotFoundException(`Place preset ${id} was not found.`);
    }

    return place;
  }

  @Mutation(() => PlacePreset, { name: 'createPlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Create)
  async createPlacePreset(
    @Args('input', { type: () => PlacePresetCreateInput }) input: PlacePresetCreateInput,
    @Context() context: GraphqlContext = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const place = await tx.placePreset.create({
        data: this.normalizePlaceInput(input),
        select: PLACE_PRESET_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PLACE_PRESET,
          entityId: place.id,
          entityLabel: place.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: place,
          scope: { permission: Permission.PlacePreset.Create },
          summary: 'Local criado.',
        },
        tx,
      );
      return place;
    });
  }

  @Mutation(() => PlacePreset, { name: 'updatePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Update)
  async updatePlacePreset(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => PlacePresetUpdateInput }) input: PlacePresetUpdateInput,
    @Context() context: GraphqlContext = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const previousPlace = await tx.placePreset.findFirst({
        where: { id, deletedAt: null },
        select: PLACE_PRESET_SELECT,
      });
      if (!previousPlace) throw new NotFoundException(`Place preset ${id} was not found.`);
      const place = await tx.placePreset.update({
        where: { id },
        data: this.normalizePlaceInput(input),
        select: PLACE_PRESET_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PLACE_PRESET,
          entityId: place.id,
          entityLabel: place.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: previousPlace,
          after: place,
          scope: { permission: Permission.PlacePreset.Update },
          summary: 'Local atualizado.',
        },
        tx,
      );
      return place;
    });
  }

  @Mutation(() => DeletionResult, { name: 'deletePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Delete)
  async deletePlacePreset(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext = {}) {
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const place = await tx.placePreset.findFirst({
        where: { id, deletedAt: null },
        select: PLACE_PRESET_SELECT,
      });
      if (!place) throw new NotFoundException(`Place preset ${id} was not found.`);
      await tx.placePreset.update({ where: { id }, data: { deletedAt } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PLACE_PRESET,
          entityId: id,
          entityLabel: place.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: place,
          after: { ...place, deletedAt },
          scope: { permission: Permission.PlacePreset.Delete },
          summary: 'Local excluído.',
          force: true,
        },
        tx,
      );
    });
    return {
      deleted: true,
      id,
    };
  }

  @Mutation(() => DeletionResult, { name: 'mergePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Merge)
  async mergePlacePreset(
    @Args('targetId', { type: () => String }) targetId: string,
    @Args('sourceId', { type: () => String }) sourceId: string,
    @Args('input', { type: () => PlacePresetUpdateInput }) input: PlacePresetUpdateInput,
    @Context() context: GraphqlContext = {},
  ) {
    if (targetId === sourceId) {
      throw new BadRequestException('Target and source place presets must be different.');
    }

    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const [target, source] = await Promise.all([
        tx.placePreset.findFirst({ where: { id: targetId, deletedAt: null }, select: PLACE_PRESET_SELECT }),
        tx.placePreset.findFirst({ where: { id: sourceId, deletedAt: null }, select: PLACE_PRESET_SELECT }),
      ]);

      if (!target) {
        throw new NotFoundException(`Place preset ${targetId} was not found.`);
      }

      if (!source) {
        throw new NotFoundException(`Place preset ${sourceId} was not found.`);
      }

      await tx.placePreset.update({
        where: {
          id: targetId,
        },
        data: this.normalizePlaceInput(input),
      });
      await tx.placePreset.update({
        where: {
          id: sourceId,
        },
        data: {
          deletedAt,
        },
      });

      const updatedTarget = await tx.placePreset.findUniqueOrThrow({
        where: {
          id: targetId,
        },
        select: PLACE_PRESET_SELECT,
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PLACE_PRESET,
          entityId: targetId,
          entityLabel: updatedTarget.name,
          operation: AuditLogOperation.MERGE,
          actor: this.getUser(context),
          before: target,
          after: updatedTarget,
          scope: { permission: Permission.PlacePreset.Merge },
          summary: `Local unificado com ${source.name}.`,
        },
        tx,
      );
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.PLACE_PRESET,
          entityId: sourceId,
          entityLabel: source.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: source,
          after: { ...source, deletedAt },
          scope: { permission: Permission.PlacePreset.Merge },
          summary: `Local absorvido por ${updatedTarget.name}.`,
          force: true,
        },
        tx,
      );
      return { target, source, updatedTarget };
    });

    return {
      deleted: true,
      id: sourceId,
    };
  }

  private normalizePlaceInput(input: PlacePresetCreateInput): Prisma.PlacePresetCreateInput;
  private normalizePlaceInput(input: PlacePresetUpdateInput): Prisma.PlacePresetUpdateInput;
  private normalizePlaceInput(input: PlacePresetCreateInput | PlacePresetUpdateInput) {
    return {
      ...('name' in input && input.name != null ? { name: input.name.trim() } : {}),
      ...('latitude' in input ? { latitude: input.latitude ?? null } : {}),
      ...('longitude' in input ? { longitude: input.longitude ?? null } : {}),
      ...('locationDescription' in input
        ? { locationDescription: input.locationDescription?.trim() || null }
        : {}),
    };
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
