import {
  DeletionResult,
  MajorEvent,
  MajorEventCreateInput,
  MajorEventUpdateInput,
  PaymentInfoInput,
} from '@cacic-eventos/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Prisma } from '@prisma/client';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';

const PAYMENT_INFO_SELECT = {
  id: true,
  bankName: true,
  agency: true,
  account: true,
  holder: true,
  document: true,
  majorEventId: true,
} satisfies Prisma.PaymentInfoSelect;

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
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  additionalPaymentInfo: true,
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

@Resolver(() => MajorEvent)
export class MajorEventsResolver {
  private paymentInfoTableExistsPromise?: Promise<boolean>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
  ) {}

  @Query(() => [MajorEvent], { name: 'majorEvents' })
  @RequireScopes('major-event#read')
  async majorEvents(
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('startDateFrom', { type: () => Date, nullable: true })
    startDateFrom?: Date,
    @Args('startDateTo', { type: () => Date, nullable: true })
    startDateTo?: Date,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.MajorEventWhereInput = {
      deletedAt: null,
    };
    const normalizedQuery = query?.trim();

    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) {
        where.startDate.gte = startDateFrom;
      }
      if (startDateTo) {
        where.startDate.lte = startDateTo;
      }
    }

    let prioritizedIds: string[] = [];
    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled()) {
        prioritizedIds = await this.typesenseSearch.searchMajorEvents(
          normalizedQuery,
          take ?? 200,
        );
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
      skip,
      take,
    });

    if (prioritizedIds.length === 0) {
      return majorEvents;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...majorEvents].sort(
      (left, right) =>
        (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  @Query(() => MajorEvent, { name: 'majorEvent' })
  @RequireScopes('major-event#read')
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
  @RequireScopes('major-event#edit')
  async createMajorEvent(
    @Args('input', { type: () => MajorEventCreateInput })
    input: MajorEventCreateInput,
  ) {
    const paymentInfoTableExists = await this.hasPaymentInfoTable();
    const data = this.buildMajorEventCreateData(input, paymentInfoTableExists);

    const majorEvent = await this.prisma.majorEvent.create({
      data,
      select: this.getMajorEventSelect(paymentInfoTableExists),
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
  @RequireScopes('major-event#edit')
  async updateMajorEvent(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => MajorEventUpdateInput })
    input: MajorEventUpdateInput,
  ) {
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
      paymentInfoTableExists &&
      'paymentInfo' in majorEvent &&
      majorEvent.paymentInfo != null;

    const data = this.buildMajorEventUpdateData(
      input,
      hasExistingPaymentInfo,
      paymentInfoTableExists,
    );

    const updatedMajorEvent = await this.prisma.majorEvent.update({
      where: {
        id,
      },
      data,
      select: this.getMajorEventSelect(paymentInfoTableExists),
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
  @RequireScopes('major-event#delete')
  async deleteMajorEvent(@Args('id', { type: () => String }) id: string) {
    const { count } = await this.prisma.majorEvent.updateMany({
      where: {
        id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Major event ${id} was not found.`);
    }

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
    if (input.buttonText !== undefined) data.buttonText = input.buttonText;
    if (input.buttonLink !== undefined) data.buttonLink = input.buttonLink;
    if (input.contactInfo !== undefined) data.contactInfo = input.contactInfo;
    if (input.contactType !== undefined) data.contactType = input.contactType;
    if (input.isPaymentRequired !== undefined) {
      data.isPaymentRequired = input.isPaymentRequired;
    }
    if (input.additionalPaymentInfo !== undefined) {
      data.additionalPaymentInfo = input.additionalPaymentInfo;
    }
    if (input.deletedAt !== undefined) data.deletedAt = input.deletedAt;
    if (input.createdAt !== undefined) data.createdAt = input.createdAt;
    if (input.createdById !== undefined) data.createdById = input.createdById;
    if (input.updatedById !== undefined) data.updatedById = input.updatedById;

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
        throw new BadRequestException(
          'Payment info is unavailable because payment_info table is missing.',
        );
      }
    }

    return data;
  }

  private buildMajorEventUpdateData(
    input: MajorEventUpdateInput,
    hasExistingPaymentInfo: boolean,
    paymentInfoTableExists: boolean,
  ): Prisma.MajorEventUpdateInput {
    const data: Prisma.MajorEventUpdateInput = {};

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
    if (input.buttonText !== undefined) data.buttonText = input.buttonText;
    if (input.buttonLink !== undefined) data.buttonLink = input.buttonLink;
    if (input.contactInfo !== undefined) data.contactInfo = input.contactInfo;
    if (input.contactType !== undefined) data.contactType = input.contactType;
    if (input.isPaymentRequired !== undefined) {
      data.isPaymentRequired = input.isPaymentRequired;
    }
    if (input.additionalPaymentInfo !== undefined) {
      data.additionalPaymentInfo = input.additionalPaymentInfo;
    }
    if (input.deletedAt !== undefined) data.deletedAt = input.deletedAt;
    if (input.createdAt !== undefined) data.createdAt = input.createdAt;
    if (input.createdById !== undefined) data.createdById = input.createdById;
    if (input.updatedById !== undefined) data.updatedById = input.updatedById;

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
        throw new BadRequestException(
          'Payment info is unavailable because payment_info table is missing.',
        );
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
      this.paymentInfoTableExistsPromise = this.prisma.$queryRaw<
        Array<{ exists: boolean }>
      >`
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
    };

    const values = Object.values(normalized);
    const hasAnyValue = values.some((value) => value.length > 0);
    if (!hasAnyValue) {
      return undefined;
    }

    const hasAllValues = values.every((value) => value.length > 0);
    if (!hasAllValues) {
      throw new BadRequestException(
        'Payment info requires bankName, agency, account, holder, and document.',
      );
    }

    return normalized;
  }
}
