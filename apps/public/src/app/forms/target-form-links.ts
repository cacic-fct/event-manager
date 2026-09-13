import { isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { EventFormTargetType } from '@cacic-fct/event-manager-public-contracts';
import { catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { InterestApiService } from '../interests/interest-api.service';
import { NetworkStatusService } from '../shared/network-status.service';
import { PublicEventFormApiService } from './event-form-api.service';
import { arePublicFormResultsReleased, isPublicFormLinkAvailable } from './event-form-availability';

@Component({
  selector: 'app-target-form-links',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    @if (links().length) {
      <nav aria-label="Formulários disponíveis" class="form-links">
        @for (link of links(); track link.linkId) {
          <a mat-button [routerLink]="['/profile/forms', link.formId]"
            [queryParams]="{ targetType: targetType(), targetId: targetId(), linkId: link.linkId }">
            <mat-icon aria-hidden="true">{{ link.results ? 'bar_chart' : 'list_alt' }}</mat-icon>
            {{ link.results ? 'Resultados: ' + link.name : link.name }}
          </a>
        }
      </nav>
    }
  `,
  styles: `.form-links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-block-start: 1rem; }`,
})
export class TargetFormLinks {
  readonly targetType = input.required<EventFormTargetType>();
  readonly targetId = input.required<string>();
  private readonly api = inject(PublicEventFormApiService);
  private readonly interests = inject(InterestApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly authenticated = inject(AuthService).isAuthenticated;
  private readonly online = inject(NetworkStatusService).isOnline;

  readonly links = toSignal(combineLatest([
    toObservable(this.targetType), toObservable(this.targetId), toObservable(this.authenticated),
    toObservable(this.online), this.interests.changes.pipe(startWith(undefined)),
  ]).pipe(switchMap(([targetType, targetId, authenticated, online]) => {
    if (!this.isBrowser || !authenticated || !online) return of([]);
    return this.api.listCurrentUserForms({
      targetType,
      eventId: targetType === 'EVENT' ? targetId : null,
      majorEventId: targetType === 'MAJOR_EVENT' ? targetId : null,
    }).pipe(map((forms) => forms.flatMap((form) => form.links.flatMap((link) => {
      if (link.targetType !== targetType || (link.eventId ?? link.majorEventId) !== targetId) return [];
      const available = isPublicFormLinkAvailable(link);
      if (!available && !arePublicFormResultsReleased(form, link)) return [];
      return [{ formId: form.id, linkId: link.id, name: form.name, results: !available }];
    }))), catchError(() => of([])));
  })), { initialValue: [] });
}
