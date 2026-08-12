import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { firstValueFrom, of } from 'rxjs';
import { EventApiService } from './detail/event-api.service';
import { ImageLicenseAgreementInterruptionFlow } from './image-license-agreement-interruption.flow';

describe('ImageLicenseAgreementInterruptionFlow', () => {
  it('redirects to the first pending major-event agreement', async () => {
    const api = {
      listRequiredImageLicenseAgreementInterruptions: vi.fn(() =>
        of([
          {
            targetType: 'MAJOR_EVENT' as const,
            eventId: null,
            majorEventId: 'major-1',
            rankedSubscriptionEnabled: true,
            displayOrder: 3,
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
        ImageLicenseAgreementInterruptionFlow,
        { provide: AuthService, useValue: { isAuthenticated: vi.fn(() => true) } },
        { provide: EventApiService, useValue: api },
        { provide: Router, useValue: router },
      ],
    });

    const flow = TestBed.inject(ImageLicenseAgreementInterruptionFlow);

    await expect(firstValueFrom(flow.resolve({ currentUrl: '/menu' }))).resolves.toEqual(
      expect.objectContaining({
        id: 'image-license-agreement:MAJOR_EVENT:major-1',
        priority: 'NORMAL',
        priorityOrder: 153,
        target,
      }),
    );
    expect(router.createUrlTree).toHaveBeenCalledWith(['/major-event', 'major-1', 'ranked-subscription'], {
      queryParams: { requireImageLicenseAgreement: true },
    });
  });

  it('does not interrupt the agreement route itself', async () => {
    const api = {
      listRequiredImageLicenseAgreementInterruptions: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        ImageLicenseAgreementInterruptionFlow,
        { provide: AuthService, useValue: { isAuthenticated: vi.fn(() => true) } },
        { provide: EventApiService, useValue: api },
        { provide: Router, useValue: { createUrlTree: vi.fn() } },
      ],
    });

    const flow = TestBed.inject(ImageLicenseAgreementInterruptionFlow);

    await expect(
      firstValueFrom(flow.resolve({ currentUrl: '/event/event-1?requireImageLicenseAgreement=true' })),
    ).resolves.toBeNull();
    expect(api.listRequiredImageLicenseAgreementInterruptions).not.toHaveBeenCalled();
  });
});
