import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { Observable, catchError, map, of, take } from 'rxjs';
import {
  INTERRUPTION_PRIORITY_ORDERS,
  Interruption,
  InterruptionContext,
  InterruptionFlow,
} from '../interruption/interruption-flow';
import { PublicEventFormApiService } from './event-form-api.service';

@Injectable({ providedIn: 'root' })
export class RequiredSubscriptionFormInterruptionFlow implements InterruptionFlow {
  private readonly api = inject(PublicEventFormApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  resolve(context: InterruptionContext): Observable<Interruption | null> {
    if (!this.auth.isAuthenticated() || context.currentUrl.startsWith('/profile/forms/')) {
      return of(null);
    }

    return this.api.listRequiredSubscriptionFormInterruptions().pipe(
      take(1),
      map((interruptions) => {
        const interruption = interruptions[0];
        if (!interruption) {
          return null;
        }

        return {
          id: `required-subscription-form:${interruption.linkId}`,
          priority: 'NORMAL',
          priorityOrder: INTERRUPTION_PRIORITY_ORDERS.REQUIRED_SUBSCRIPTION_FORM + interruption.displayOrder,
          target: this.router.createUrlTree(['/profile/forms', interruption.formId], {
            queryParams: {
              linkId: interruption.linkId,
              targetType: interruption.targetType,
              targetId: interruption.eventId ?? interruption.majorEventId,
            },
          }),
        } satisfies Interruption;
      }),
      catchError(() => of(null)),
    );
  }
}
