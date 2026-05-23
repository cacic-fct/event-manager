import { User } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

@Resolver(() => User)
export class UsersResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [User], { name: 'users' })
  @RequireScopes('user#read')
  users(
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      skip: pagination.skip,
      take: pagination.take,
    });
  }

  @Query(() => User, { name: 'user' })
  @RequireScopes('user#read')
  async user(@Args('id', { type: () => String }) id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${id} was not found.`);
    }

    return user;
  }
}
