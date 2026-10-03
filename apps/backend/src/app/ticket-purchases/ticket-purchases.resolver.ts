import { UnauthorizedException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { TicketPurchaseModel, TicketPurchaseOptionModel } from './ticket-purchase.models';
import { TicketPurchasesService } from './ticket-purchases.service';

type TicketPurchaseContext = { req?: { user?: AuthenticatedUser }; request?: { user?: AuthenticatedUser } };

@Resolver()
export class TicketPurchasesResolver {
  constructor(private readonly purchases: TicketPurchasesService) {}

  @Query(() => [TicketPurchaseOptionModel])
  myTicketPurchaseOptions(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: TicketPurchaseContext,
  ) {
    return this.purchases.options(majorEventId, this.user(context));
  }

  @Query(() => [TicketPurchaseModel])
  myTicketPurchases(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: TicketPurchaseContext,
  ) {
    return this.purchases.mine(majorEventId, this.user(context));
  }

  @Mutation(() => Boolean)
  approveTicketPurchase(
    @Args('purchaseId', { type: () => String }) purchaseId: string,
    @Context() context: TicketPurchaseContext,
  ) {
    return this.purchases.approve(purchaseId, this.user(context));
  }

  @Mutation(() => Boolean)
  rejectTicketPurchase(
    @Args('purchaseId', { type: () => String }) purchaseId: string,
    @Args('reason', { type: () => String }) reason: string,
    @Context() context: TicketPurchaseContext,
  ) {
    return this.purchases.reject(purchaseId, reason, this.user(context));
  }

  private user(context: TicketPurchaseContext): AuthenticatedUser {
    const user = context.req?.user ?? context.request?.user;
    if (!user?.sub) throw new UnauthorizedException();
    return user;
  }
}
