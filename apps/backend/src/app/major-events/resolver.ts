import {
  DeletionResult,
  MajorEventPriceInput,
  MajorEvent,
  MajorEventCreateInput,
  MajorEventUpdateInput,
  PaymentInfoInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

const PAYMENT_INFO_SELECT = {
  id: true,
  bankName: true,
  agency: true,
  account: true,
  holder: true,
  document: true,
  pixKey: true,
  pixCity: true,
  majorEventId: true,
} satisfies Prisma.PaymentInfoSelect;

const MAJOR_EVENT_PRICE_SELECT = {
  id: true,
  type: true,
  tiers: {
    select: {
      id: true,
      name: true,
      value: true,
    },
    orderBy: {
      value: 'asc',
    },
  },
} satisfies Prisma.MajorEventPriceSelect;

const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  maxUncategorizedPerAttendee: true,
  rankedSubscriptionEnabled: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
  majorEventPrices: {
    select: MAJOR_EVENT_PRICE_SELECT,
  },
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

const MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT = {
  ...MAJOR_EVENT_SELECT,
  paymentInfo: {
    select: PAYMENT_INFO_SELECT,
  },
} satisfies Prisma.MajorEventSelect;

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => MajorEvent)
export class MajorEventsResolver {
  private paymentInfoTableExistsPromise?: Promise<boolean>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
  ) {}

  @Query(() => [MajorEvent], { name: 'majorEvents' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.MajorEvent.Read)
  async majorEvents(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateUntil', { type: () => Date, nullable: true })
    startDateUntil?: Date,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
    };
    const accessibleMajorEventIds = await this.authorizationPolicy.accessibleMajorEventIds(
      this.getUser(context),
      Permission.MajorEvent.Read,
    );
    if (accessibleMajorEventIds && accessibleMajorEventIds.size === 0) {
      return [];
    }
    if (accessibleMajorEventIds) {
      where.id = {
        in: [...accessibleMajorEventIds],
      };
    }
    const normalizedQuery = query?.trim();

    if (startDateFrom || startDateUntil) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate.gte = startDateFrom;
      }
      if (startDateUntil) {
        where.startDate.lte = startDateUntil;
      }
    }

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchMajorEvents(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (accessibleMajorEventIds) {
          prioritizedIds = prioritizedIds.filter((id) => accessibleMajorEventIds.has(id));
        }
        if (prioritizedIds.length === 0) {
          return [];
        }
        where.id = { in: prioritizedIds };
      } else {
        where.name = { contains: normalizedQuery, mode: 'insensitive' };
      }
    }

    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const majorEvents = await this.prisma.majorEvent.findMany({
      where,
      select: this.getMajorEventSelect(paymentInfoTableExists),
      orderBy: {
        startDate: 'desc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return majorEvents;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...majorEvents]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => MajorEvent, { name: 'majorEvent' })
  @RequirePermissions(Permission.MajorEvent.Read)
  async majorEvent(@Args('id', { type: () => String }) id: string) {
    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: this.getMajorEventSelect(paymentInfoTableExists),
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${id} was not found.`);
    }

    return majorEvent;
  }

  @Mutation(() => MajorEvent, { name: 'createMajorEvent' })
  @RequirePermissions(Permission.MajorEvent.Create)
  async createMajorEvent(
    @Args('input', { type: () => MajorEventCreateInput })
    input: MajorEventCreateInput,
    @Context() context: GraphqlContext,
  ) {
    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const data = this.buildMajorEventCreateData(input, paymentInfoTableExists);

    const majorEvent = await this.prisma.$transaction(async (tx) => {
      const created = await tx.majorEvent.create({
        data,
        select: this.getMajorEventSelect(paymentInfoTableExists),
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: created,
          scope: { permission: Permission.MajorEvent.Create, majorEventId: created.id },
          summary: 'Grande evento criado.',
        },
        tx,
      );
      return created;
    });
    await this.typesenseSearch.upsertMajorEvent({
      id: majorEvent.id,
      name: majorEvent.name,
      description: majorEvent.description,
      startDate: majorEvent.startDate,
      endDate: majorEvent.endDate,
    });
    return majorEvent;
  }

  @Mutation(() => MajorEvent, { name: 'updateMajorEvent' })
  @RequirePermissions(Permission.MajorEvent.Update)
  async updateMajorEvent(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => MajorEventUpdateInput })
    input: MajorEventUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertMajorEventMutable(id, this.getUser(context), 'edit');
    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: this.getMajorEventSelect(paymentInfoTableExists),
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${id} was not found.`);
    }

    const hasExistingPaymentInfo =
      paymentInfoTableExists && 'paymentInfo' in majorEvent && majorEvent.paymentInfo != null;

    const data = this.buildMajorEventUpdateData(
      input,
      majorEvent.isPaymentRequired,
      hasExistingPaymentInfo,
      paymentInfoTableExists,
    );

    const updatedMajorEvent = await this.prisma.$transaction(async (tx) => {
      await tx.majorEvent.update({
        where: {
          id,
        },
        data,
      });

      if (input.price !== undefined) {
        await this.syncMajorEventPrice(tx, id, input.price);
      }

      const updated = await tx.majorEvent.findUniqueOrThrow({
        where: {
          id,
        },
        select: this.getMajorEventSelect(paymentInfoTableExists),
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: majorEvent,
          after: updated,
          scope: { permission: Permission.MajorEvent.Update, majorEventId: updated.id },
          summary: 'Grande evento atualizado.',
        },
        tx,
      );
      return updated;
    });
    await this.typesenseSearch.upsertMajorEvent({
      id: updatedMajorEvent.id,
      name: updatedMajorEvent.name,
      description: updatedMajorEvent.description,
      startDate: updatedMajorEvent.startDate,
      endDate: updatedMajorEvent.endDate,
    });
    return updatedMajorEvent;
  }

  @Mutation(() => DeletionResult, { name: 'deleteMajorEvent' })
  @RequirePermissions(Permission.MajorEvent.Delete)
  async deleteMajorEvent(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertMajorEventMutable(id, this.getUser(context), 'delete');
    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const majorEvent = await tx.majorEvent.findFirst({
        where: { id, deletedAt: null },
        select: this.getMajorEventSelect(paymentInfoTableExists),
      });
      if (!majorEvent) throw new NotFoundException(`Major event ${id} was not found.`);
      await tx.majorEvent.update({ where: { id }, data: { deletedAt } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.MAJOR_EVENT,
          entityId: id,
          entityLabel: majorEvent.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: majorEvent,
          after: { ...majorEvent, deletedAt },
          scope: { permission: Permission.MajorEvent.Delete, majorEventId: id },
          summary: 'Grande evento excluído.',
          force: true,
        },
        tx,
      );
    });
    await this.typesenseSearch.deleteMajorEvent(id);
    return {
      deleted: true,
      id,
    };
  }

  private buildMajorEventCreateData(
    input: MajorEventCreateInput,
    paymentInfoTableExists: boolean,
  ): Prisma.MajorEventCreateInput {
    const data: Prisma.MajorEventCreateInput = {
      name: input.name,
      emoji: input.emoji?.trim() || '📌',
      startDate: input.startDate,
      endDate: input.endDate,
    };

    if (input.id !== undefined) data.id = input.id;
    if (input.description !== undefined) data.description = input.description;
    if (input.subscriptionStartDate !== undefined) {
      data.subscriptionStartDate = input.subscriptionStartDate;
    }
    if (input.subscriptionEndDate !== undefined) {
      data.subscriptionEndDate = input.subscriptionEndDate;
    }
    if (input.maxCoursesPerAttendee !== undefined) {
      data.maxCoursesPerAttendee = input.maxCoursesPerAttendee;
    }
    if (input.maxLecturesPerAttendee !== undefined) {
      data.maxLecturesPerAttendee = input.maxLecturesPerAttendee;
    }
    if (input.maxUncategorizedPerAttendee !== undefined) {
      data.maxUncategorizedPerAttendee = input.maxUncategorizedPerAttendee;
    }
    if (input.rankedSubscriptionEnabled !== undefined) {
      data.rankedSubscriptionEnabled = input.rankedSubscriptionEnabled;
    }
    if (input.buttonText !== undefined) data.buttonText = input.buttonText;
    if (input.buttonLink !== undefined) data.buttonLink = input.buttonLink;
    if (input.contactInfo !== undefined) data.contactInfo = input.contactInfo;
    if (input.contactType !== undefined) data.contactType = input.contactType;
    if (input.isPaymentRequired !== undefined) {
      data.isPaymentRequired = input.isPaymentRequired;
    }
    if (input.shouldIssueCertificateForNonPayingAttendees !== undefined) {
      data.shouldIssueCertificateForNonPayingAttendees = input.isPaymentRequired
        ? false
        : input.shouldIssueCertificateForNonPayingAttendees;
    }
    if (input.shouldIssueCertificateForNonSubscribedAttendees !== undefined) {
      data.shouldIssueCertificateForNonSubscribedAttendees = input.shouldIssueCertificateForNonSubscribedAttendees;
    }
    if (input.additionalPaymentInfo !== undefined) {
      data.additionalPaymentInfo = input.additionalPaymentInfo;
    }

    if (paymentInfoTableExists) {
      const paymentInfo = this.buildPaymentInfoPayload(input.paymentInfo);
      if (paymentInfo) {
        data.paymentInfo = {
          create: paymentInfo,
        };
      }
    } else {
      const paymentInfo = this.buildPaymentInfoPayload(input.paymentInfo);
      if (paymentInfo) {
        throw new BadRequestException('Payment info is unavailable because payment_info table is missing.');
      }
    }

    const price = this.buildPricePayload(input.price);
    if (price) {
      data.majorEventPrices = {
        create: price,
      };
    }

    return data;
  }

  private buildMajorEventUpdateData(
    input: MajorEventUpdateInput,
    currentIsPaymentRequired: boolean,
    hasExistingPaymentInfo: boolean,
    paymentInfoTableExists: boolean,
  ): Prisma.MajorEventUpdateInput {
    const data: Prisma.MajorEventUpdateInput = {};
    const effectiveIsPaymentRequired = input.isPaymentRequired ?? currentIsPaymentRequired;

    if (input.id !== undefined) data.id = input.id;
    if (input.name !== undefined) data.name = input.name;
    if (input.emoji !== undefined) data.emoji = input.emoji.trim() || '📌';
    if (input.startDate !== undefined) data.startDate = input.startDate;
    if (input.endDate !== undefined) data.endDate = input.endDate;
    if (input.description !== undefined) data.description = input.description;
    if (input.subscriptionStartDate !== undefined) {
      data.subscriptionStartDate = input.subscriptionStartDate;
    }
    if (input.subscriptionEndDate !== undefined) {
      data.subscriptionEndDate = input.subscriptionEndDate;
    }
    if (input.maxCoursesPerAttendee !== undefined) {
      data.maxCoursesPerAttendee = input.maxCoursesPerAttendee;
    }
    if (input.maxLecturesPerAttendee !== undefined) {
      data.maxLecturesPerAttendee = input.maxLecturesPerAttendee;
    }
    if (input.maxUncategorizedPerAttendee !== undefined) {
      data.maxUncategorizedPerAttendee = input.maxUncategorizedPerAttendee;
    }
    if (input.rankedSubscriptionEnabled !== undefined) {
      data.rankedSubscriptionEnabled = input.rankedSubscriptionEnabled;
    }
    if (input.buttonText !== undefined) data.buttonText = input.buttonText;
    if (input.buttonLink !== undefined) data.buttonLink = input.buttonLink;
    if (input.contactInfo !== undefined) data.contactInfo = input.contactInfo;
    if (input.contactType !== undefined) data.contactType = input.contactType;
    if (input.isPaymentRequired !== undefined) {
      data.isPaymentRequired = input.isPaymentRequired;
    }
    if (effectiveIsPaymentRequired) {
      data.shouldIssueCertificateForNonPayingAttendees = false;
    } else if (input.shouldIssueCertificateForNonPayingAttendees !== undefined) {
      data.shouldIssueCertificateForNonPayingAttendees = input.shouldIssueCertificateForNonPayingAttendees;
    }
    if (input.shouldIssueCertificateForNonSubscribedAttendees !== undefined) {
      data.shouldIssueCertificateForNonSubscribedAttendees = input.shouldIssueCertificateForNonSubscribedAttendees;
    }
    if (input.additionalPaymentInfo !== undefined) {
      data.additionalPaymentInfo = input.additionalPaymentInfo;
    }

    if (paymentInfoTableExists) {
      if (input.paymentInfo !== undefined) {
        if (input.paymentInfo === null) {
          if (hasExistingPaymentInfo) {
            data.paymentInfo = { delete: true };
          }
        } else {
          const paymentInfo = this.buildPaymentInfoPayload(input.paymentInfo);
          if (paymentInfo) {
            data.paymentInfo = {
              upsert: {
                create: paymentInfo,
                update: paymentInfo,
              },
            };
          } else if (hasExistingPaymentInfo) {
            data.paymentInfo = { delete: true };
          }
        }
      }
    } else if (input.paymentInfo !== undefined) {
      const paymentInfo = this.buildPaymentInfoPayload(input.paymentInfo);
      if (paymentInfo) {
        throw new BadRequestException('Payment info is unavailable because payment_info table is missing.');
      }
      if (input.paymentInfo === null && hasExistingPaymentInfo) {
        data.paymentInfo = { delete: true };
      }
    }

    return data;
  }

  private getMajorEventSelect(paymentInfoTableExists: boolean) {
    if (paymentInfoTableExists) {
      return MAJOR_EVENT_WITH_PAYMENT_INFO_SELECT;
    }

    return MAJOR_EVENT_SELECT;
  }

  private async hasPaymentInfoTable(): Promise<boolean> {
    if (!this.paymentInfoTableExistsPromise) {
      this.paymentInfoTableExistsPromise = this.prisma.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'payment_info'
          ) AS "exists"
        `.then((result) => Boolean(result[0]?.exists));
    }

    return this.paymentInfoTableExistsPromise;
  }

  private buildPaymentInfoPayload(
    paymentInfo: PaymentInfoInput | null | undefined,
  ): Prisma.PaymentInfoCreateWithoutMajorEventInput | undefined {
    if (!paymentInfo) {
      return undefined;
    }

    const normalized: Prisma.PaymentInfoCreateWithoutMajorEventInput = {
      bankName: paymentInfo.bankName.trim(),
      agency: paymentInfo.agency.trim(),
      account: paymentInfo.account.trim(),
      holder: paymentInfo.holder.trim(),
      document: paymentInfo.document.trim(),
      pixKey: paymentInfo.pixKey?.trim() || null,
      pixCity: paymentInfo.pixCity?.trim() || null,
    };

    const bankValues = [normalized.bankName, normalized.agency, normalized.account, normalized.holder];
    const hasAnyBankValue = bankValues.some((value) => value.length > 0);
    const hasAllBankValues = bankValues.every((value) => value.length > 0);
    const hasDocument = normalized.document.length > 0;
    const hasPixValue = Boolean(normalized.pixKey);

    if (!hasAnyBankValue && !hasDocument && !hasPixValue) {
      return undefined;
    }

    if (hasAnyBankValue && !hasAllBankValues) {
      throw new BadRequestException('Bank payment info requires bankName, agency, account, and holder.');
    }

    if (hasAllBankValues && !hasDocument) {
      throw new BadRequestException('Bank payment info requires document.');
    }

    return normalized;
  }

  private buildPricePayload(
    input: MajorEventPriceInput | null | undefined,
  ): Prisma.MajorEventPriceCreateWithoutMajorEventInput | undefined {
    if (!input) {
      return undefined;
    }

    const tiers = this.buildPriceTierPayloads(input);

    if (tiers.length === 0) {
      return undefined;
    }

    if (tiers.some((tier) => !Number.isFinite(tier.value) || tier.value < 0)) {
      throw new BadRequestException('Price tier values must be valid non-negative amounts in cents.');
    }

    if (input.type === 'SINGLE' && tiers.length !== 1) {
      throw new BadRequestException('Single price requires exactly one tier.');
    }

    return {
      type: input.type,
      tiers: {
        create: tiers,
      },
    };
  }

  private async syncMajorEventPrice(
    tx: Prisma.TransactionClient,
    majorEventId: string,
    input: MajorEventPriceInput | null,
  ): Promise<void> {
    if (input === null) {
      await this.deleteMajorEventPrice(tx, majorEventId);
      return;
    }

    const tiers = this.buildPriceTierPayloads(input);

    if (tiers.length === 0) {
      await this.deleteMajorEventPrice(tx, majorEventId);
      return;
    }

    if (tiers.some((tier) => !Number.isFinite(tier.value) || tier.value < 0)) {
      throw new BadRequestException('Price tier values must be valid non-negative amounts in cents.');
    }

    if (input.type === 'SINGLE' && tiers.length !== 1) {
      throw new BadRequestException('Single price requires exactly one tier.');
    }

    await tx.majorEventPrice.upsert({
      where: {
        majorEventId,
      },
      create: {
        majorEventId,
        type: input.type,
        tiers: {
          create: tiers,
        },
      },
      update: {
        type: input.type,
        tiers: {
          deleteMany: {},
          create: tiers,
        },
      },
    });
  }

  private async deleteMajorEventPrice(tx: Prisma.TransactionClient, majorEventId: string): Promise<void> {
    await tx.priceTier.deleteMany({
      where: {
        price: {
          majorEventId,
        },
      },
    });
    await tx.majorEventPrice.deleteMany({
      where: {
        majorEventId,
      },
    });
  }

  private buildPriceTierPayloads(input: MajorEventPriceInput): Prisma.PriceTierCreateWithoutPriceInput[] {
    return input.tiers
      .map((tier) => ({
        name: tier.name.trim(),
        value: Math.round(tier.value),
      }))
      .filter((tier) => tier.name.length > 0);
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}
