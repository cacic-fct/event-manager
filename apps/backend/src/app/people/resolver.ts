import { DeletionResult, Person, PersonCreateInput, PersonUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  ConflictException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { CertificateIssuingService } from '../certificate/certificate-issuing.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

@Resolver(() => Person)
export class PeopleResolver {
  private readonly logger = new Logger(PeopleResolver.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly certificateIssuingService: CertificateIssuingService,
  ) {}

  @Query(() => [Person], { name: 'people' })
  @RequirePermissions(Permission.Person.Read)
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
    const pagination = resolvePagination(skip, take);
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
          pagination.skip + pagination.take,
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
        lecturerProfile: true,
      },
      orderBy: {
        name: 'asc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return people;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...people]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => Person, { name: 'person' })
  @RequirePermissions(Permission.Person.Read)
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
        lecturerProfile: true,
      },
    });

    if (!person) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    return person;
  }

  @Mutation(() => Person, { name: 'createPerson' })
  @RequirePermissions(Permission.Person.Create)
  async createPerson(@Args('input', { type: () => PersonCreateInput }) input: PersonCreateInput) {
    await this.ensureNoDuplicateIdentity(input);

    const person = await this.prisma.people.create({
      data: this.buildPersonCreateData(input),
      include: {
        user: true,
        lecturerProfile: true,
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
  @RequirePermissions(Permission.Person.Update)
  async updatePerson(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => PersonUpdateInput }) input: PersonUpdateInput,
  ) {
    const existingPerson = await this.prisma.people.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: {
        name: true,
        email: true,
        phone: true,
        identityDocument: true,
        academicId: true,
        userId: true,
      },
    });

    if (!existingPerson) {
      throw new NotFoundException(`Person ${id} was not found.`);
    }

    this.ensureExternallyManagedFieldsAreUnchanged(input, existingPerson);
    await this.ensureNoDuplicateIdentity(input, id);

    const { count } = await this.prisma.people.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: this.buildPersonUpdateData(input),
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
        lecturerProfile: true,
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
    if (person && this.shouldRefreshCertificates(existingPerson, person)) {
      try {
        await this.certificateIssuingService.refreshIssuedCertificatesForPerson(person.id);
      } catch (error) {
        this.logger.error(
          `Failed to refresh certificates after admin update for person ${person.id}.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return person;
  }

  @Mutation(() => DeletionResult, { name: 'deletePerson' })
  @RequirePermissions(Permission.Person.Delete)
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
    if (!input.identityDocument?.trim() && !input.email?.trim() && !input.name?.trim()) {
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

  private shouldRefreshCertificates(
    before: Pick<Person, 'name' | 'identityDocument'>,
    after: Pick<Person, 'name' | 'identityDocument'>,
  ): boolean {
    return before.name !== after.name || before.identityDocument !== after.identityDocument;
  }

  private ensureExternallyManagedFieldsAreUnchanged(
    input: PersonUpdateInput,
    existingPerson: {
      name: string;
      email: string | null;
      phone: string | null;
      identityDocument: string | null;
      academicId: string | null;
      userId: string | null;
    },
  ): void {
    if (!existingPerson.userId) {
      return;
    }

    const lockedFields = [
      ['name', input.name, existingPerson.name],
      ['email', input.email, existingPerson.email],
      ['phone', input.phone, existingPerson.phone],
      ['identityDocument', input.identityDocument, existingPerson.identityDocument],
      ['academicId', input.academicId, existingPerson.academicId],
    ] as const;

    const changedFields = lockedFields
      .filter(([, nextValue, currentValue]) => nextValue !== undefined && nextValue !== currentValue)
      .map(([field]) => field);

    if (changedFields.length > 0) {
      throw new UnprocessableEntityException(
        `Person is linked to a Keycloak account. Externally managed fields cannot be edited: ${changedFields.join(', ')}.`,
      );
    }
  }

  private buildPersonCreateData(input: PersonCreateInput): Prisma.PeopleUncheckedCreateInput {
    return {
      ...(input.id !== undefined ? { id: input.id } : {}),
      name: input.name,
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.secondaryEmails !== undefined ? { secondaryEmails: input.secondaryEmails } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.identityDocument !== undefined ? { identityDocument: input.identityDocument } : {}),
      ...(input.academicId !== undefined ? { academicId: input.academicId } : {}),
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.mergedIntoId !== undefined ? { mergedIntoId: input.mergedIntoId } : {}),
      ...(input.externalRef !== undefined ? { externalRef: input.externalRef } : {}),
    };
  }

  private buildPersonUpdateData(input: PersonUpdateInput): Prisma.PeopleUncheckedUpdateManyInput {
    const data: Prisma.PeopleUncheckedUpdateManyInput = {};

    if (input.id !== undefined) data.id = input.id;
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.secondaryEmails !== undefined) data.secondaryEmails = input.secondaryEmails;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.identityDocument !== undefined) data.identityDocument = input.identityDocument;
    if (input.academicId !== undefined) data.academicId = input.academicId;
    if (input.userId !== undefined) data.userId = input.userId;
    if (input.mergedIntoId !== undefined) data.mergedIntoId = input.mergedIntoId;
    if (input.externalRef !== undefined) data.externalRef = input.externalRef;

    return data;
  }
}
