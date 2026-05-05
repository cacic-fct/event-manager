import {
  DeletionResult,
  MergeCandidate,
  MergeCandidateMergeInput,
  MergeCandidateCreateInput,
  MergeCandidateStatus,
  MergeCandidateUpdateInput,
} from '@cacic-eventos/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { RequireScopes } from '../../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { MergeCandidateOperationsService } from './operations.service';

@Resolver(() => MergeCandidate)
export class MergeCandidatesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mergeOperations: MergeCandidateOperationsService,
  ) {}

  @Query(() => [MergeCandidate], { name: 'mergeCandidates' })
  @RequireScopes('merge-candidate#read')
  mergeCandidates(
    @Args('status', { type: () => MergeCandidateStatus, nullable: true })
    status?: MergeCandidateStatus,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.MergeCandidateWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (status === 'PENDING') {
      where.personA = {
        is: {
          deletedAt: null,
          mergedIntoId: null,
        },
      };
      where.personB = {
        is: {
          deletedAt: null,
          mergedIntoId: null,
        },
      };
    }

    return this.prisma.mergeCandidate.findMany({
      where,
      include: {
        personA: true,
        personB: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      skip,
      take,
    });
  }

  @Query(() => MergeCandidate, { name: 'mergeCandidate' })
  @RequireScopes('merge-candidate#read')
  async mergeCandidate(@Args('id', { type: () => String }) id: string) {
    const candidate = await this.prisma.mergeCandidate.findUnique({
      where: {
        id,
      },
      include: {
        personA: true,
        personB: true,
      },
    });

    if (!candidate) {
      throw new NotFoundException(`Merge candidate ${id} was not found.`);
    }

    return candidate;
  }

  @Mutation(() => MergeCandidate, { name: 'createMergeCandidate' })
  @RequireScopes('merge-candidate#edit')
  createMergeCandidate(
    @Args('input', { type: () => MergeCandidateCreateInput })
    input: MergeCandidateCreateInput,
  ) {
    return this.prisma.mergeCandidate.create({
      data: input,
    });
  }

  @Mutation(() => MergeCandidate, { name: 'updateMergeCandidate' })
  @RequireScopes('merge-candidate#edit')
  async updateMergeCandidate(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => MergeCandidateUpdateInput })
    input: MergeCandidateUpdateInput,
    @Context() context: { req?: { user?: AuthenticatedUser } },
  ) {
    const actorId = this.getActorId(context);

    const data: MergeCandidateUpdateInput = {
      ...input,
      updatedById: actorId ?? undefined,
    };
    if (input.status === 'PENDING') {
      data.resolvedById = null;
    } else if (input.status === 'MERGED' || input.status === 'REJECTED') {
      data.resolvedById = actorId ?? undefined;
    }

    const { count } = await this.prisma.mergeCandidate.updateMany({
      where: {
        id,
      },
      data,
    });

    if (count === 0) {
      throw new NotFoundException(`Merge candidate ${id} was not found.`);
    }

    return this.prisma.mergeCandidate.findUnique({
      where: {
        id,
      },
      include: {
        personA: true,
        personB: true,
      },
    });
  }

  @Mutation(() => Int, { name: 'scanMergeCandidates' })
  @RequireScopes('merge-candidate#edit')
  scanMergeCandidates(
    @Context() context: { req?: { user?: AuthenticatedUser } },
  ) {
    return this.mergeOperations.scanMergeCandidates(this.getActorId(context));
  }

  @Mutation(() => MergeCandidate, { name: 'mergeCandidatePeople' })
  @RequireScopes('merge-candidate#edit')
  mergeCandidatePeople(
    @Args('input', { type: () => MergeCandidateMergeInput })
    input: MergeCandidateMergeInput,
    @Context() context: { req?: { user?: AuthenticatedUser } },
  ) {
    return this.mergeOperations.mergeCandidatePeople(
      input,
      this.getActorId(context),
    );
  }

  @Mutation(() => MergeCandidate, { name: 'undoMergeCandidatePeople' })
  @RequireScopes('merge-candidate#edit')
  undoMergeCandidatePeople(
    @Args('candidateId', { type: () => String }) candidateId: string,
    @Context() context: { req?: { user?: AuthenticatedUser } },
  ) {
    return this.mergeOperations.undoMergeCandidatePeople(
      candidateId,
      this.getActorId(context),
    );
  }

  @Mutation(() => DeletionResult, { name: 'deleteMergeCandidate' })
  @RequireScopes('merge-candidate#delete')
  async deleteMergeCandidate(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.mergeCandidate.deleteMany({
      where: {
        id,
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Merge candidate ${id} was not found.`);
    }

    return {
      deleted: true,
      id,
    };
  }

  private getActorId(context: {
    req?: { user?: AuthenticatedUser };
  }): string | null {
    const user = context.req?.user;
    return user?.sub ?? user?.email ?? user?.preferredUsername ?? null;
  }
}
