import {
  DeletionResult,
  PlacePreset,
  PlacePresetCreateInput,
  PlacePresetUpdateInput,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
  async createPlacePreset(@Args('input', { type: () => PlacePresetCreateInput }) input: PlacePresetCreateInput) {
    return this.prisma.placePreset.create({
      data: this.normalizePlaceInput(input),
      select: PLACE_PRESET_SELECT,
    });
  }

  @Mutation(() => PlacePreset, { name: 'updatePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Update)
  async updatePlacePreset(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => PlacePresetUpdateInput }) input: PlacePresetUpdateInput,
  ) {
    const { count } = await this.prisma.placePreset.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: this.normalizePlaceInput(input),
    });

    if (count === 0) {
      throw new NotFoundException(`Place preset ${id} was not found.`);
    }

    return this.placePreset(id);
  }

  @Mutation(() => DeletionResult, { name: 'deletePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Delete)
  async deletePlacePreset(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.placePreset.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Place preset ${id} was not found.`);
    }

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
  ) {
    if (targetId === sourceId) {
      throw new BadRequestException('Target and source place presets must be different.');
    }

    await this.prisma.$transaction(async (tx) => {
      const [target, source] = await Promise.all([
        tx.placePreset.findFirst({ where: { id: targetId, deletedAt: null }, select: { id: true } }),
        tx.placePreset.findFirst({ where: { id: sourceId, deletedAt: null }, select: { id: true } }),
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
          deletedAt: new Date(),
        },
      });
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
}
