import { Component, input, output } from '@angular/core';
import type { DetailViewModel } from '@cacic-fct/shared-utils';
import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';

/** Public-page unit tests isolate the independently tested participation loader. */
@Component({ selector: 'app-more-info', template: '<ng-content />' })
export class ParticipationWorkspaceStub {
  readonly embedded = input(false);
  readonly flatSections = input(false);
  readonly detailLoaded = output<DetailViewModel | null>();
  readonly participationChange = output<boolean>();
  readonly targetType = input<EventTargetType | null>(null);
  readonly targetId = input<string | null>(null);
  readonly refreshKey = input(0);
}
