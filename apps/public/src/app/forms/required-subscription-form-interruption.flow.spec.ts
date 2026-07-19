import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, of } from 'rxjs';
import { PublicEventFormApiService } from './event-form-api.service';
import { RequiredSubscriptionFormInterruptionFlow } from './required-subscription-form-interruption.flow';

describe('RequiredSubscriptionFormInterruptionFlow', () => {
  it('redirects to the first unanswered required subscription form', async () => {
    const api = {
      listRequiredSubscriptionFormInterruptions: vi.fn(() =>
        of([
          {
            formId: 'form-1',
            linkId: 'link-1',
            targetType: 'EVENT' as const,
            eventId: 'event-1',
            majorEventId: null,
            displayOrder: 4,
          },
        ]),
      ),
    };
    const target = {};
    const router = {
      createUrlTree: vi.fn(() => target),
    };
    TestBed.configureTestingModule({
      providers: [
        RequiredSubscriptionFormInterruptionFlow,
        { provide: AuthService, useValue: { isAuthenticated: vi.fn(() => true) } },
        { provide: PublicEventFormApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });

    const flow = TestBed.inject(RequiredSubscriptionFormInterruptionFlow);

    await expect(firstValueFrom(flow.resolve({ currentUrl: '/menu' }))).resolves.toEqual(
      expect.objectContaining({
        id: 'required-subscription-form:link-1',
        priority: 'NORMAL',
        priorityOrder: 204,
        target,
      }),
    );
    expect(router.createUrlTree).toHaveBeenCalledWith(['/profile/forms', 'form-1'], {
      queryParams: {
        linkId: 'link-1',
        targetType: 'EVENT',
        targetId: 'event-1',
      },
    });
  });

  it('does not interrupt a person already filling a form', async () => {
    const api = {
      listRequiredSubscriptionFormInterruptions: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        RequiredSubscriptionFormInterruptionFlow,
        { provide: AuthService, useValue: { isAuthenticated: vi.fn(() => true) } },
        { provide: PublicEventFormApiService, useValue: api },
        { provide: Router, useValue: { createUrlTree: vi.fn() } },
      ],
    });

    const flow = TestBed.inject(RequiredSubscriptionFormInterruptionFlow);

    await expect(firstValueFrom(flow.resolve({ currentUrl: '/profile/forms/form-1' }))).resolves.toBeNull();
    expect(api.listRequiredSubscriptionFormInterruptions).not.toHaveBeenCalled();
  });
});
