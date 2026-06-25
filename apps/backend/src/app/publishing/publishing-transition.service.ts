import { BadRequestException, Injectable } from '@nestjs/common';
import { PublicationState as PrismaPublicationState } from '@prisma/client';
import { PublicationState, PublicationTargetType } from '@cacic-fct/shared-data-types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { describeBulkOperation, describeStateChange } from './publishing-labels';
import { PublicationBulkInput, PublicationBulkOperation, PublicationStateInput } from './publishing.models';
import { PublicationSearchSyncService } from './publishing-search-sync.service';
import { PublicationStateWriterService } from './publishing-state-writer.service';
import { PublicationTargetService } from './publishing-target.service';
import { PublicationTransitionOutcome, TargetSync } from './publishing.types';

@Injectable()
export class PublicationTransitionService {
  constructor(
    private readonly searchSync: PublicationSearchSyncService,
    private readonly stateWriter: PublicationStateWriterService,
    private readonly targets: PublicationTargetService,
  ) {}

  async setPublicationState(
    input: PublicationStateInput,
    user: AuthenticatedUser | undefined,
  ): Promise<PublicationTransitionOutcome> {
    const sync = await this.applyTargetState({
      targetType: input.targetType,
      targetId: input.targetId,
      state: input.state,
      scheduledPublishAt: input.scheduledPublishAt ?? null,
      user,
    });
    await this.searchSync.syncSearch(sync);

    return {
      result: {
        ok: true,
        message: describeStateChange(input.state, sync),
        affectedEventIds: sync.eventIds,
        affectedMajorEventIds: sync.majorEventIds,
      },
      sync,
      scheduledState: input.state,
      scheduledPublishAt: input.scheduledPublishAt ?? null,
    };
  }

  async runBulkOperation(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<PublicationTransitionOutcome> {
    const sync =
      input.operation === PublicationBulkOperation.PUBLISH_MISSING_CHILDREN
        ? await this.publishMissingChildren(input, user)
        : input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE
          ? await this.scheduleBundle(input, user)
          : await this.unpublishBundle(input, user);

    await this.searchSync.syncSearch(sync);

    return {
      result: {
        ok: true,
        message: describeBulkOperation(input.operation, sync),
        affectedEventIds: sync.eventIds,
        affectedMajorEventIds: sync.majorEventIds,
      },
      sync,
      scheduledState:
        input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE ? PrismaPublicationState.SCHEDULED : null,
      scheduledPublishAt: input.operation === PublicationBulkOperation.SCHEDULE_BUNDLE ? input.scheduledPublishAt ?? null : null,
    };
  }

  async publishEventById(eventId: string, user: AuthenticatedUser | null): Promise<TargetSync> {
    return this.stateWriter.updateEventPublicationState(
      eventId,
      PrismaPublicationState.PUBLISHED,
      null,
      user ?? undefined,
    );
  }

  async publishMajorEventById(majorEventId: string, user: AuthenticatedUser | null): Promise<TargetSync> {
    return this.stateWriter.updateMajorEventPublicationState(
      majorEventId,
      PrismaPublicationState.PUBLISHED,
      null,
      user ?? undefined,
    );
  }

  mergeSync(syncs: TargetSync[]): TargetSync {
    return {
      eventIds: [...new Set(syncs.flatMap((sync) => sync.eventIds))],
      majorEventIds: [...new Set(syncs.flatMap((sync) => sync.majorEventIds))],
    };
  }

  private async applyTargetState(input: {
    targetType: PublicationTargetType;
    targetId: string;
    state: PublicationState;
    scheduledPublishAt: Date | null;
    user: AuthenticatedUser | undefined;
  }): Promise<TargetSync> {
    if (input.targetType === PublicationTargetType.EVENT) {
      return this.stateWriter.updateEventPublicationState(
        input.targetId,
        input.state,
        input.scheduledPublishAt,
        input.user,
      );
    }

    if (input.targetType === PublicationTargetType.MAJOR_EVENT) {
      return this.stateWriter.updateMajorEventPublicationState(
        input.targetId,
        input.state,
        input.scheduledPublishAt,
        input.user,
      );
    }

    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      requireChildren: true,
    });
    const updates = await Promise.all(
      eventIds.map((eventId) =>
        this.stateWriter.updateEventPublicationState(eventId, input.state, input.scheduledPublishAt, input.user),
      ),
    );
    return this.mergeSync(updates);
  }

  private async publishMissingChildren(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      onlyMissingPublication: true,
    });
    const updates = await Promise.all(
      eventIds.map((eventId) =>
        this.stateWriter.updateEventPublicationState(eventId, PrismaPublicationState.PUBLISHED, null, user),
      ),
    );
    return this.mergeSync(updates);
  }

  private async scheduleBundle(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    if (!input.scheduledPublishAt) {
      throw new BadRequestException('Escolha a data e hora de publicação.');
    }

    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      includeTargetEvent: true,
    });
    const updates = await Promise.all(
      eventIds.map((eventId) =>
        this.stateWriter.updateEventPublicationState(
          eventId,
          PrismaPublicationState.SCHEDULED,
          input.scheduledPublishAt ?? null,
          user,
        ),
      ),
    );
    if (input.targetType === PublicationTargetType.MAJOR_EVENT) {
      updates.push(
        await this.stateWriter.updateMajorEventPublicationState(
          input.targetId,
          PrismaPublicationState.SCHEDULED,
          input.scheduledPublishAt,
          user,
        ),
      );
    }
    return this.mergeSync(updates);
  }

  private async unpublishBundle(
    input: PublicationBulkInput,
    user: AuthenticatedUser | undefined,
  ): Promise<TargetSync> {
    const eventIds = await this.targets.resolveChildEventIds(input.targetType, input.targetId, {
      includeTargetEvent: true,
    });
    const updates = await Promise.all(
      eventIds.map((eventId) =>
        this.stateWriter.updateEventPublicationState(eventId, PrismaPublicationState.UNPUBLISHED, null, user),
      ),
    );
    if (input.targetType === PublicationTargetType.MAJOR_EVENT) {
      updates.push(
        await this.stateWriter.updateMajorEventPublicationState(
          input.targetId,
          PrismaPublicationState.UNPUBLISHED,
          null,
          user,
        ),
      );
    }
    return this.mergeSync(updates);
  }
}
