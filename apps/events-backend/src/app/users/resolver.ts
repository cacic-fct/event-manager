import { User } from '@cacic-eventos/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
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
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
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
