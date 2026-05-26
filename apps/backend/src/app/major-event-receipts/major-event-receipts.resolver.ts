import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MajorEventReceiptsService } from './major-event-receipts.service';
import {
  AdminReceiptPendingCount,
  AdminReceiptQueue,
  AdminReceiptQueueItemModel,
  AdminReceiptValidationResultModel,
  ApproveReceiptInput,
  CurrentUserReceipt,
  RejectReceiptInput,
} from './receipt.models';
import { RECEIPT_ADMIN_EDIT_PERMISSION, RECEIPT_ADMIN_PERMISSION } from './receipt.types';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver()
export class MajorEventReceiptsResolver {
  constructor(private readonly receipts: MajorEventReceiptsService) {}

  @Query(() => CurrentUserReceipt, {
    name: 'currentUserMajorEventReceipt',
    nullable: true,
  })
  currentUserMajorEventReceipt(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Context() context: GraphqlContext,
  ) {
    return this.receipts.getCurrentReceipt(majorEventId, this.requireAuthenticatedUser(context));
  }

  @Query(() => AdminReceiptPendingCount, {
    name: 'adminReceiptPendingValidationCount',
  })
  @RequireScopes(RECEIPT_ADMIN_PERMISSION)
  adminReceiptPendingValidationCount() {
    return this.receipts.getPendingValidationCount();
  }

  @Query(() => AdminReceiptQueue, {
    name: 'adminReceiptValidationQueue',
  })
  @RequireScopes(RECEIPT_ADMIN_PERMISSION)
  adminReceiptValidationQueue(
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ) {
    return this.receipts.listPendingValidationQueue(majorEventId?.trim() || undefined);
  }

  @Mutation(() => AdminReceiptValidationResultModel, {
    name: 'approveAdminReceipt',
  })
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  approveAdminReceipt(@Args('input') input: ApproveReceiptInput, @Context() context: GraphqlContext) {
    return this.receipts.approveReceipt(
      input.subscriptionId,
      input.receiptId,
      Array.isArray(input.selectedEventIds) ? input.selectedEventIds : undefined,
      this.requireAuthenticatedUser(context),
    );
  }

  @Mutation(() => AdminReceiptValidationResultModel, {
    name: 'rejectAdminReceipt',
  })
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  rejectAdminReceipt(@Args('input') input: RejectReceiptInput, @Context() context: GraphqlContext) {
    return this.receipts.rejectReceipt(
      input.subscriptionId,
      input.receiptId,
      input.rejectionCode,
      input.reason,
      this.requireAuthenticatedUser(context),
    );
  }

  @Mutation(() => AdminReceiptQueueItemModel, {
    name: 'undoAdminReceiptValidationAction',
  })
  @RequireScopes(RECEIPT_ADMIN_EDIT_PERMISSION)
  undoAdminReceiptValidationAction(
    @Args('actionId', { type: () => String }) actionId: string,
    @Context() context: GraphqlContext,
  ) {
    return this.receipts.undoValidationAction(actionId, this.requireAuthenticatedUser(context));
  }

  private requireAuthenticatedUser(context: GraphqlContext): AuthenticatedUser {
    const user = context.req?.user ?? context.request?.user;
    if (!user) {
      throw new BadRequestException('Missing authenticated user.');
    }

    return user;
  }
}
