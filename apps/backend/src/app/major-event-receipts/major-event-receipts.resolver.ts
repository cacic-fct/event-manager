import { BadRequestException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../common/frozen-resource.service';
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
import {
  RECEIPT_ADMIN_PERMISSION,
  RECEIPT_APPROVE_PERMISSION,
  RECEIPT_REJECT_PERMISSION,
  RECEIPT_UNDO_PERMISSION,
} from './receipt.types';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver()
export class MajorEventReceiptsResolver {
  constructor(
    private readonly receipts: MajorEventReceiptsService,
    private readonly frozenResources: FrozenResourceService,
  ) {}

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
  @RequirePermissions(RECEIPT_ADMIN_PERMISSION)
  adminReceiptPendingValidationCount() {
    return this.receipts.getPendingValidationCount();
  }

  @Query(() => AdminReceiptQueue, {
    name: 'adminReceiptValidationQueue',
  })
  @RequirePermissions(RECEIPT_ADMIN_PERMISSION)
  adminReceiptValidationQueue(
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ) {
    return this.receipts.listPendingValidationQueue(majorEventId?.trim() || undefined);
  }

  @Mutation(() => AdminReceiptValidationResultModel, {
    name: 'approveAdminReceipt',
  })
  @RequirePermissions(RECEIPT_APPROVE_PERMISSION)
  async approveAdminReceipt(
    @Args('input', { type: () => ApproveReceiptInput }) input: ApproveReceiptInput,
    @Context() context: GraphqlContext,
  ) {
    const user = this.requireAuthenticatedUser(context);
    await this.frozenResources.assertMajorEventSubscriptionMutable(input.subscriptionId, user, 'edit');
    return this.receipts.approveReceipt(
      input.subscriptionId,
      input.receiptId,
      Array.isArray(input.selectedEventIds) ? input.selectedEventIds : undefined,
      user,
    );
  }

  @Mutation(() => AdminReceiptValidationResultModel, {
    name: 'rejectAdminReceipt',
  })
  @RequirePermissions(RECEIPT_REJECT_PERMISSION)
  async rejectAdminReceipt(
    @Args('input', { type: () => RejectReceiptInput }) input: RejectReceiptInput,
    @Context() context: GraphqlContext,
  ) {
    const user = this.requireAuthenticatedUser(context);
    await this.frozenResources.assertMajorEventSubscriptionMutable(input.subscriptionId, user, 'edit');
    return this.receipts.rejectReceipt(
      input.subscriptionId,
      input.receiptId,
      input.rejectionCode,
      input.reason,
      user,
    );
  }

  @Mutation(() => AdminReceiptQueueItemModel, {
    name: 'undoAdminReceiptValidationAction',
  })
  @RequirePermissions(RECEIPT_UNDO_PERMISSION)
  async undoAdminReceiptValidationAction(
    @Args('actionId', { type: () => String }) actionId: string,
    @Context() context: GraphqlContext,
  ) {
    const user = this.requireAuthenticatedUser(context);
    await this.frozenResources.assertReceiptValidationActionMutable(actionId, user, 'edit');
    return this.receipts.undoValidationAction(actionId, user);
  }

  private requireAuthenticatedUser(context: GraphqlContext): AuthenticatedUser {
    const user = context.req?.user ?? context.request?.user;
    if (!user) {
      throw new BadRequestException('Missing authenticated user.');
    }

    return user;
  }
}
