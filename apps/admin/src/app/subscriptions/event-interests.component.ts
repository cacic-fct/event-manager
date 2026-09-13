import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  InterestTargetType,
  type InterestTargetType as InterestTargetTypeValue,
} from '@cacic-fct/shared-event-participation';
import { Observable, Subscription, auditTime, debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InterestConversionDialogComponent, type InterestConversionDialogData, type InterestConversionDialogResult } from './interest-conversion-dialog.component';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import {
  InterestApiService,
  type AdminEventInterest,
} from '../graphql/interest-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
  WORKSPACE_LIST_PAGE_SIZE,
} from '../pagination/list-pagination';
import {
  InterestEventSelectionDialogComponent,
  type InterestEventSelectionItem,
  type InterestEventSelectionDialogResult,
} from './interest-event-selection-dialog.component';

interface InterestTarget {
  targetType: InterestTargetTypeValue;
  targetId: string;
  name: string;
  emoji: string;
  kindLabel: string;
  interestEnabled: boolean;
  startDate?: string | null;
}

interface TargetEventResolution {
  eventIds: string[];
  events: InterestEventSelectionItem[];
}

@Component({
  selector: 'app-workspace-event-interests',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatTooltipModule,
    TwemojiComponent,
  ],
  templateUrl: './event-interests.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './subscription-subtabs.shared.scss',
  ],
})
export class EventInterestsComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly eventApi = inject(EventApiService);
  private readonly eventGroupApi = inject(EventGroupApiService);
  private readonly majorEventApi = inject(MajorEventApiService);
  private readonly api = inject(InterestApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly realtime = inject(RealtimeApiService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly permissions = inject(PermissionsService);
  protected readonly Permission = Permission;

  readonly targetSearchForm = this.formBuilder.nonNullable.group({ query: [''] });
  readonly targetQuery = signal('');
  readonly targets = signal<InterestTarget[]>([]);
  readonly selectedTarget = signal<InterestTarget | null>(null);
  readonly interests = signal<AdminEventInterest[]>([]);
  readonly targetEventIds = signal<string[]>([]);
  readonly targetEvents = signal<InterestEventSelectionItem[]>([]);
  readonly loadingTargets = signal(false);
  readonly loadingInterests = signal(false);
  readonly convertingInterestId = signal<string | null>(null);
  readonly interestsPagination = createWorkspaceListPagination();
  readonly filteredTargets = computed(() => {
    const query = this.targetQuery().trim().toLocaleLowerCase('pt-BR');
    if (!query) {
      return this.targets();
    }

    return this.targets().filter((target) =>
      `${target.name} ${target.kindLabel}`.toLocaleLowerCase('pt-BR').includes(query),
    );
  });
  private targetsRequest = 0;
  private interestsRequest = 0;
  private targetRealtimeSubscriptions: Subscription[] = [];
  private targetRealtimeKey = '';

  constructor() {
    this.targetSearchForm.controls.query.valueChanges
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.targetQuery.set(query));
    this.realtime
      .watchWorkspace()
      .pipe(auditTime(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadTargets());
    this.destroyRef.onDestroy(() => this.closeTargetRealtime());
    void this.loadTargets();
  }

  async loadTargets(): Promise<void> {
    const request = ++this.targetsRequest;
    this.loadingTargets.set(true);
    try {
      await this.permissions.evaluateWorkspacePermissions();
      const results = await Promise.allSettled([
        this.permissions.has(Permission.Event.Read)
          ? this.loadAllTargetPages((page) => this.eventApi.listEvents(page))
          : Promise.resolve([]),
        this.permissions.has(Permission.EventGroup.Read)
          ? this.loadAllTargetPages((page) => this.eventGroupApi.listEventGroups(page))
          : Promise.resolve([]),
        this.permissions.has(Permission.MajorEvent.Read)
          ? this.loadAllTargetPages((page) => this.majorEventApi.listMajorEvents(page))
          : Promise.resolve([]),
      ]);
      const [eventResult, groupResult, majorResult] = results;
      const events = eventResult.status === 'fulfilled' ? eventResult.value : [];
      const groups = groupResult.status === 'fulfilled' ? groupResult.value : [];
      const majorEvents = majorResult.status === 'fulfilled' ? majorResult.value : [];
      const failure = results.find((result) => result.status === 'rejected');
      if (failure?.status === 'rejected' && request === this.targetsRequest) {
        this.feedback.error(failure.reason, 'Não foi possível carregar alguns eventos ou grupos. Tente novamente.');
      }
      if (request !== this.targetsRequest) {
        return;
      }

      const targets: InterestTarget[] = [
        ...events
          .map((event) => ({
            interestEnabled: event.interestEnabled === true,
            targetType: InterestTargetType.EVENT,
            targetId: event.id,
            name: event.name,
            emoji: event.emoji,
            kindLabel: 'Evento',
            startDate: event.startDate,
          })),
        ...groups
          .map((group) => ({
            interestEnabled: group.interestEnabled === true,
            targetType: InterestTargetType.EVENT_GROUP,
            targetId: group.id,
            name: group.name,
            emoji: group.emoji,
            kindLabel: 'Grupo de eventos',
            startDate: null,
          })),
        ...majorEvents
          .map((majorEvent) => ({
            interestEnabled: majorEvent.interestEnabled === true,
            targetType: InterestTargetType.MAJOR_EVENT,
            targetId: majorEvent.id,
            name: majorEvent.name,
            emoji: majorEvent.emoji,
            kindLabel: 'Grande evento',
            startDate: majorEvent.startDate,
          })),
      ].sort((left, right) => {
        if (!left.startDate && !right.startDate) {
          return left.name.localeCompare(right.name, 'pt-BR');
        }
        if (!left.startDate) return 1;
        if (!right.startDate) return -1;
        return left.startDate.localeCompare(right.startDate);
      });

      this.targets.set(targets);
      const current = this.selectedTarget();
      const next = current
        ? targets.find((target) => this.targetKey(target) === this.targetKey(current))
        : targets[0];
      if (next) {
        if (current && this.targetKey(current) === this.targetKey(next)) {
          this.selectedTarget.set(next);
          await this.loadInterests();
        } else {
          await this.selectTarget(next);
        }
      } else {
        this.selectedTarget.set(null);
        this.interests.set([]);
        this.closeTargetRealtime();
      }
    } catch (error) {
      this.feedback.error(error, 'Não foi possível carregar os interesses.');
    } finally {
      if (request === this.targetsRequest) {
        this.loadingTargets.set(false);
      }
    }
  }

  async selectTarget(target: InterestTarget): Promise<void> {
    this.selectedTarget.set(target);
    resetPagination(this.interestsPagination);
    await this.loadInterests();
  }

  async loadInterests(): Promise<void> {
    const target = this.selectedTarget();
    if (!target) {
      this.interests.set([]);
      this.targetEventIds.set([]);
      this.targetEvents.set([]);
      return;
    }

    const request = ++this.interestsRequest;
    this.loadingInterests.set(true);
    try {
      const [interests, targetEventResolution] = await Promise.all([
        firstValueFrom(this.api.listInterests(target.targetType, target.targetId, pageVariables(this.interestsPagination.pageIndex()))),
        this.resolveTargetEventIds(target),
      ]);
      if (request !== this.interestsRequest || this.selectedTarget() !== target) {
        return;
      }
      this.targetEventIds.set(targetEventResolution.eventIds);
      this.targetEvents.set(targetEventResolution.events);
      this.syncTargetRealtime(target, targetEventResolution.eventIds);
      this.interests.set(applyPagedResult(interests, this.interestsPagination));
    } catch (error) {
      if (request === this.interestsRequest) {
        this.feedback.error(error, 'Não foi possível carregar a lista de interessados.');
      }
    } finally {
      if (request === this.interestsRequest) {
        this.loadingInterests.set(false);
      }
    }
  }

  async previousInterestsPage(): Promise<void> {
    await loadPreviousPage(this.interestsPagination, () => this.loadInterests());
  }

  async nextInterestsPage(): Promise<void> {
    await loadNextPage(this.interestsPagination, () => this.loadInterests());
  }

  async convertInterest(interest: AdminEventInterest): Promise<void> {
    const target = this.selectedTarget();
    if (!target || this.convertingInterestId() || !this.canConvertInterest(interest)) {
      return;
    }

    this.convertingInterestId.set(interest.id);
    try {
      const selectedEventIds = await this.selectedEventIdsForConversion(target);
      if (!selectedEventIds) {
        return;
      }
      const requiresImageLicenseAgreement = await this.requiresImageLicenseAgreement(target);
      const confirmation = await firstValueFrom(
        this.dialog.open<InterestConversionDialogComponent, InterestConversionDialogData, InterestConversionDialogResult>(InterestConversionDialogComponent, {
          data: {
            personName: interest.person?.name ?? interest.personId,
            targetName: target.name,
            requiresImageLicenseAgreement,
          },
          width: 'min(460px, 96vw)',
        }).afterClosed(),
      );
      if (!confirmation || (requiresImageLicenseAgreement && !confirmation.imageLicenseAgreementAccepted)) {
        return;
      }

      await firstValueFrom(
        this.api.convertInterestToSubscription({
          interestId: interest.id,
          selectedEventIds,
          ...(confirmation.imageLicenseAgreementAccepted ? { imageLicenseAgreementAccepted: true } : {}),
        }),
      );
      this.interests.update((items) =>
        items.map((item) => (item.id === interest.id ? { ...item, isSubscribed: true } : item)),
      );
      this.snackbar.open('Interesse convertido em inscrição.', 'Fechar', { duration: 3500 });
    } catch (error) {
      this.feedback.error(error, 'Não foi possível converter o interesse em inscrição.');
    } finally {
      this.convertingInterestId.set(null);
    }
  }

  canConvertInterest(interest: AdminEventInterest): boolean {
    const target = this.selectedTarget();
    return (
      this.permissions.has(Permission.Subscription.Create) &&
      Boolean(target) &&
      (target?.targetType === InterestTargetType.EVENT || this.targetEventIds().length > 0) &&
      interest.isSubscribed !== true
    );
  }

  targetTypeLabel(targetType: InterestTargetTypeValue): string {
    switch (targetType) {
      case InterestTargetType.EVENT:
        return 'Evento';
      case InterestTargetType.EVENT_GROUP:
        return 'Grupo de eventos';
      case InterestTargetType.MAJOR_EVENT:
        return 'Grande evento';
    }
  }

  interestCountLabel(): string {
    const count = this.interests().length;
    return `${count} ${count === 1 ? 'interesse' : 'interesses'} nesta página`;
  }

  interestPaginationLabel(): string {
    const count = this.interests().length;
    if (count === 0) {
      return 'Nenhum item nesta página';
    }
    const firstItem = this.interestsPagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE + 1;
    return `Itens ${firstItem}-${firstItem + count - 1}`;
  }

  private async loadAllTargetPages<T>(
    load: (page: { skip: number; take: number }) => Observable<T[]>,
  ): Promise<T[]> {
    const items: T[] = [];
    const take = 200;
    for (let skip = 0; ; skip += take) {
      const page = await firstValueFrom(load({ skip, take }));
      items.push(...page);
      if (page.length < take) {
        return items;
      }
    }
  }

  private async requiresImageLicenseAgreement(target: InterestTarget): Promise<boolean> {
    switch (target.targetType) {
      case InterestTargetType.EVENT: {
        const event = await firstValueFrom(this.eventApi.getEvent(target.targetId));
        const majorEventId = event.majorEventId ?? event.eventGroup?.majorEventId;
        if (majorEventId) {
          const majorEvent = await firstValueFrom(this.majorEventApi.getMajorEvent(majorEventId));
          return majorEvent.requiresImageLicenseAgreement === true;
        }
        return Boolean(event.requiresImageLicenseAgreement || event.eventGroup?.requiresImageLicenseAgreement);
      }
      case InterestTargetType.EVENT_GROUP: {
        const group = await firstValueFrom(this.eventGroupApi.getEventGroup(target.targetId));
        if (group.majorEventId) {
          const majorEvent = await firstValueFrom(this.majorEventApi.getMajorEvent(group.majorEventId));
          return majorEvent.requiresImageLicenseAgreement === true;
        }
        return group.requiresImageLicenseAgreement === true;
      }
      case InterestTargetType.MAJOR_EVENT: {
        const majorEvent = await firstValueFrom(this.majorEventApi.getMajorEvent(target.targetId));
        return majorEvent.requiresImageLicenseAgreement === true;
      }
    }
  }

  private async resolveTargetEventIds(target: InterestTarget): Promise<TargetEventResolution> {
    if (target.targetType === InterestTargetType.EVENT) {
      const events = [{ id: target.targetId, name: target.name, startDate: target.startDate ?? '' }];
      return { eventIds: [target.targetId], events };
    }

    try {
      const events = await this.loadAllTargetPages((page) =>
        this.eventApi.listEvents(
          target.targetType === InterestTargetType.MAJOR_EVENT
            ? { majorEventId: target.targetId, ...page }
            : { eventGroupId: target.targetId, ...page },
        ),
      );
      const selectionItems = events.map((event) => ({
        id: event.id,
        name: event.name,
        startDate: event.startDate,
      }));
      return { eventIds: selectionItems.map((event) => event.id), events: selectionItems };
    } catch {
      return { eventIds: [], events: [] };
    }
  }

  private async selectedEventIdsForConversion(target: InterestTarget): Promise<string[] | null> {
    if (target.targetType !== InterestTargetType.MAJOR_EVENT) {
      return this.targetEventIds();
    }

    const result = await firstValueFrom(
      this.dialog.open<
        InterestEventSelectionDialogComponent,
        { targetName: string; events: Array<{ id: string; name: string; startDate: string }> },
        InterestEventSelectionDialogResult
      >(InterestEventSelectionDialogComponent, {
        data: {
          targetName: target.name,
          events: this.targetEvents(),
        },
        width: 'min(560px, 96vw)',
      }).afterClosed(),
    );

    return result?.selectedEventIds ?? null;
  }

  private targetKey(target: InterestTarget): string {
    return `${target.targetType}:${target.targetId}`;
  }

  private syncTargetRealtime(target: InterestTarget, eventIds: string[]): void {
    const nextKey = `${this.targetKey(target)}:${eventIds.join(',')}`;
    if (nextKey === this.targetRealtimeKey) {
      return;
    }

    this.closeTargetRealtime();
    this.targetRealtimeKey = nextKey;
    const streams =
      target.targetType === InterestTargetType.MAJOR_EVENT
        ? [this.realtime.watchMajorEventSubscriptions(target.targetId)]
        : [...new Set(eventIds)].map((eventId) => this.realtime.watchEventSubscriptions(eventId));
    this.targetRealtimeSubscriptions = streams.map((stream) =>
      stream.pipe(auditTime(0), takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        const selected = this.selectedTarget();
        if (selected && this.targetKey(selected) === this.targetKey(target)) {
          void this.loadInterests();
        }
      }),
    );
  }

  private closeTargetRealtime(): void {
    for (const subscription of this.targetRealtimeSubscriptions) {
      subscription.unsubscribe();
    }
    this.targetRealtimeSubscriptions = [];
    this.targetRealtimeKey = '';
  }
}
