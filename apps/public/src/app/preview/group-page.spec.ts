import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { of, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { ForbiddenGraphqlError } from '../shared/rate-limit-error';
import { MajorEventSubscriptionApiService } from '../major-events/registration/subscription-api.service';
import type { PublicationGroupPreview } from '../major-events/registration/subscription-api.service';
import { GroupPreviewComponent } from './group-page';

describe('GroupPreviewComponent', () => {
  let fixture: ComponentFixture<GroupPreviewComponent>;
  let routeErrors: { navigate: ReturnType<typeof vi.fn> };

  afterEach(() => TestBed.resetTestingModule());

  it('masks a forbidden preview token as shared not found', async () => {
    await configure({ previewToken: 'private-preview-token' }, throwError(() => new ForbiddenGraphqlError('forbidden')));

    expect(routeErrors.navigate).toHaveBeenCalledWith(404);
    expect(fixture.nativeElement.textContent).not.toContain('forbidden');
  });

  it('routes a missing preview token to shared not found', async () => {
    await configure({}, of({} as unknown as PublicationGroupPreview));

    expect(routeErrors.navigate).toHaveBeenCalledWith(404);
  });

  async function configure(
    params: { previewToken?: string },
    previewResponse: Observable<PublicationGroupPreview>,
  ): Promise<void> {
    routeErrors = { navigate: vi.fn(() => Promise.resolve(true)) };
    await TestBed.configureTestingModule({
      imports: [GroupPreviewComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(params) } },
        },
        { provide: MajorEventSubscriptionApiService, useValue: { getPreviewGroup: () => previewResponse } },
        { provide: RouteErrorService, useValue: routeErrors },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GroupPreviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }
});
