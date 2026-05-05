import {
  DeletionResult,
  Person,
  PersonCreateInput,
  PersonUpdateInput,
} from '@cacic-eventos/shared-data-types';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

@Resolver(() => Person)
export class PeopleResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [Person], { name: 'people' })
  @RequireScopes('person#read')
  async people(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('userId', { type: () => String, nullable: true }) userId?: string,
    @Args('email', { type: () => String, nullable: true }) email?: string,
    @Args('phone', { type: () => String, nullable: true }) phone?: string,
    @Args('identityDocument', { type: () => String, nullable: true })
    identityDocument?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.PeopleWhereInput = {
      deletedAt: null,
    };

    if (userId) {
      where.userId = userId;
    }

    if (email) {
      where.email = { equals: email, mode: 'insensitive' };
    }

    if (phone) {
      where.phone = { contains: phone, mode: 'insensitive' };
    }

    if (identityDocument) {
      where.identityDocument = identityDocument;
    }

    const normalizedQuery = query?.trim();
    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchPeople(
          normalizedQuery,
          take ?? 200,
        );
        if (prioritizedIds.length === 0) {
          return [];
        }
        where.id = { in: prioritizedIds };
      } else {
        where.OR = [
          { name: { contains: normalizedQuery, mode: 'insensitive' } },
          { email: { contains: normalizedQuery, mode: 'insensitive' } },
          { phone: { contains: normalizedQuery, mode: 'insensitive' } },
          { identityDocument: { contains: normalizedQuery } },
          { academicId: { contains: normalizedQuery } },
        ];
      }
    }

    const people = await this.prisma.people.findMany({
      where,
      include: {
        user: true,
      },
      orderBy: {
        name: 'asc',
      },
      skip,
      take,
    });

    if (prioritizedIds.length === 0) {
      return people;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...people].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  @Query(() => Person, { name: 'person' })
  @RequireScopes('person#read')
  async person(@Args('id', { type: () => String }) id: string) {
    const person = await this.prisma.people.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        user: true,
        attendances: true,
        lectures: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    return person;
  }

  @Mutation(() => Person, { name: 'createPerson' })
  @RequireScopes('person#edit')
  async createPerson(
    @Args('input', { type: () => PersonCreateInput }) input: PersonCreateInput,
  ) {
    await this.ensureNoDuplicateIdentity(input);

    const person = await this.prisma.people.create({
      data: input,
      include: {
        user: true,
      },
    });
    await this.typesenseSearch.upsertPerson({
      id: person.id,
      name: person.name,
      email: person.email,
      secondaryEmails: person.secondaryEmails,
      phone: person.phone,
      identityDocument: person.identityDocument,
      academicId: person.academicId,
      userId: person.userId,
    });
    return person;
  }

  @Mutation(() => Person, { name: 'updatePerson' })
  @RequireScopes('person#edit')
  async updatePerson(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => PersonUpdateInput }) input: PersonUpdateInput,
  ) {
    await this.ensureNoDuplicateIdentity(input, id);

    const { count } = await this.prisma.people.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: input,
    });

    if (count === 0) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    const person = await this.prisma.people.findUnique({
      where: {
        id,
      },
      include: {
        user: true,
      },
    });
    if (person) {
      await this.typesenseSearch.upsertPerson({
        id: person.id,
        name: person.name,
        email: person.email,
        secondaryEmails: person.secondaryEmails,
        phone: person.phone,
        identityDocument: person.identityDocument,
        academicId: person.academicId,
        userId: person.userId,
      });
    }
    return person;
  }

  @Mutation(() => DeletionResult, { name: 'deletePerson' })
  @RequireScopes('person#delete')
  async deletePerson(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.people.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    await this.typesenseSearch.deletePerson(id);
    return {
      deleted: true,
      id,
    };
  }

  private async ensureNoDuplicateIdentity(
    input: PersonCreateInput | PersonUpdateInput,
    excludeId?: string,
  ): Promise<void> {
    if (
      !input.identityDocument?.trim() &&
      !input.email?.trim() &&
      !input.name?.trim()
    ) {
      throw new UnprocessableEntityException(
        'A person must include at least one of: identityDocument, email, or name.',
      );
    }

    const normalizedIdentityDocument = input.identityDocument?.trim();
    const normalizedEmail = input.email?.trim();
    const normalizedName = input.name?.trim();

    const duplicateFilters: Prisma.PeopleWhereInput[] = [];
    if (normalizedIdentityDocument) {
      duplicateFilters.push({ identityDocument: normalizedIdentityDocument });
    }
    if (normalizedEmail) {
      duplicateFilters.push({
        email: { equals: normalizedEmail, mode: 'insensitive' },
      });
    }
    if (normalizedName) {
      duplicateFilters.push({
        name: { equals: normalizedName, mode: 'insensitive' },
      });
    }

    if (duplicateFilters.length === 0) {
      return;
    }

    const duplicate = await this.prisma.people.findFirst({
      where: {
        deletedAt: null,
        OR: duplicateFilters,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        identityDocument: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        `Person ${duplicate.id} already exists with matching identity document, email, or name.`,
      );
    }
  }
}
