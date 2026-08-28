import { Service, inject } from '@angular/core';
import type {
  EventFormTargetType,
  PublicEventForm,
  PublicEventFormLink,
} from '@cacic-fct/event-manager-public-contracts';
import { parseFormAnswersJson } from '@cacic-fct/shared-angular';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { PublicEventFormApiService } from '../../../forms/event-form-api.service';
import {
  subscriptionFlowSourceKey,
  subscriptionFormKey,
  type SubscriptionFlowSourceDescriptor,
  type SubscriptionFormContext,
} from './subscription-flow.models';

@Service()
export class SubscriptionFormFlowService {
  private readonly formsApi = inject(PublicEventFormApiService);

  loadForms(sources: readonly SubscriptionFlowSourceDescriptor[], selectedPriceTierId: string | null) {
    return forkJoin(
      sources.map((source) =>
        this.formsApi
          .listCurrentUserForms({
            targetType: source.targetType,
            eventId: source.targetType === 'EVENT' ? source.targetId : null,
            majorEventId: source.targetType === 'MAJOR_EVENT' ? source.targetId : null,
            subscriptionFlowOnly: true,
            selectedPriceTierId: source.targetType === 'MAJOR_EVENT' ? selectedPriceTierId : null,
          })
          .pipe(map((forms) => forms.flatMap((form) => this.toFormContexts(form, source, selectedPriceTierId)))),
      ),
    ).pipe(
      map((groups) => {
        const seen = new Set<string>();
        const sourceOrder = new Map(sources.map((source) => [subscriptionFlowSourceKey(source), source.order]));
        return groups
          .flat()
          .filter((form) => {
            const key = subscriptionFormKey(form);
            if (seen.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          })
          .sort(
            (left, right) =>
              (sourceOrder.get(subscriptionFlowSourceKey(left)) ?? Number.MAX_SAFE_INTEGER) -
                (sourceOrder.get(subscriptionFlowSourceKey(right)) ?? Number.MAX_SAFE_INTEGER) ||
              this.formDisplayOrder(left) - this.formDisplayOrder(right),
          );
      }),
      switchMap((forms) =>
        forms.length > 0
          ? forkJoin(forms.map((form) => this.loadExistingAnswer(form)))
          : of([] satisfies SubscriptionFormContext[]),
      ),
    );
  }

  private toFormContexts(
    form: PublicEventForm,
    target: SubscriptionFlowSourceDescriptor<EventFormTargetType>,
    selectedPriceTierId: string | null,
  ): SubscriptionFormContext[] {
    const links = form.links.filter((link) => this.isEligibleLink(link, target, selectedPriceTierId));
    const matchingLinks = links.length > 0 ? links : [null];

    return matchingLinks.map((link) => ({
      form,
      targetType: target.targetType,
      targetId: target.targetId,
      targetName: target.targetName,
      linkId: link?.id ?? null,
      requiredInSubscriptionFlow: link?.requiredInSubscriptionFlow ?? false,
      initialAnswers: [],
      submitted: false,
      editable: true,
    }));
  }

  private loadExistingAnswer(form: SubscriptionFormContext) {
    return this.formsApi
      .getCurrentUserResponse({
        formId: form.form.id,
        linkId: form.linkId,
        targetType: form.targetType,
        eventId: form.targetType === 'EVENT' ? form.targetId : null,
        majorEventId: form.targetType === 'MAJOR_EVENT' ? form.targetId : null,
      })
      .pipe(
        map((response) => ({
          ...form,
          initialAnswers: parseFormAnswersJson(response?.answersJson),
          submitted: Boolean(response),
          editable: !response || form.form.responseMode === 'MULTIPLE_PER_TARGET' || form.form.allowResponseEdits,
        })),
      );
  }

  private formDisplayOrder(form: SubscriptionFormContext): number {
    return form.form.links.find((link) => link.id === form.linkId)?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  }

  private isEligibleLink(
    link: PublicEventFormLink,
    target: { targetType: EventFormTargetType; targetId: string },
    selectedPriceTierId: string | null,
  ): boolean {
    if (
      !link.insertInSubscriptionFlow ||
      link.targetType !== target.targetType ||
      (link.eventId ?? null) !== (target.targetType === 'EVENT' ? target.targetId : null) ||
      (link.majorEventId ?? null) !== (target.targetType === 'MAJOR_EVENT' ? target.targetId : null)
    ) {
      return false;
    }
    if (
      target.targetType === 'MAJOR_EVENT' &&
      link.priceTierIds.length > 0 &&
      !link.priceTierIds.includes(selectedPriceTierId ?? '')
    ) {
      return false;
    }
    const now = Date.now();
    const availableFrom = link.availableFrom ? Date.parse(link.availableFrom) : null;
    const availableUntil = link.availableUntil ? Date.parse(link.availableUntil) : null;
    return (
      (availableFrom === null || Number.isNaN(availableFrom) || availableFrom <= now) &&
      (availableUntil === null || Number.isNaN(availableUntil) || availableUntil > now)
    );
  }
}
