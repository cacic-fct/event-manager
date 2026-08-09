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
import { EventApiService } from './detail/event-api.service';

@Injectable({ providedIn: 'root' })
export class ImageLicenseAgreementInterruptionFlow implements InterruptionFlow {
  private readonly api = inject(EventApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  resolve(context: InterruptionContext): Observable<Interruption | null> {
    if (!this.auth.isAuthenticated() || context.currentUrl.includes('requireImageLicenseAgreement=true')) {
      return of(null);
    }

    return this.api.listRequiredImageLicenseAgreementInterruptions().pipe(
      take(1),
      map((interruptions) => {
        const interruption = interruptions[0];
        if (
          !interruption ||
          (interruption.targetType === 'MAJOR_EVENT' && !interruption.majorEventId) ||
          (interruption.targetType === 'EVENT' && !interruption.eventId)
        ) {
          return null;
        }

        const target =
          interruption.targetType === 'MAJOR_EVENT'
            ? this.router.createUrlTree(
                [
                  '/major-event',
                  interruption.majorEventId,
                  interruption.rankedSubscriptionEnabled ? 'ranked-subscription' : 'subscription',
                ],
                { queryParams: { requireImageLicenseAgreement: true } },
              )
            : this.router.createUrlTree(['/event', interruption.eventId], {
                queryParams: { requireImageLicenseAgreement: true },
              });

        return {
          id: `image-license-agreement:${interruption.targetType}:${interruption.eventId ?? interruption.majorEventId}`,
          priority: 'NORMAL',
          priorityOrder: INTERRUPTION_PRIORITY_ORDERS.IMAGE_LICENSE_AGREEMENT + interruption.displayOrder,
          target,
        } satisfies Interruption;
      }),
      catchError(() => of(null)),
    );
  }
}
