import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, Subject } from 'rxjs';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { ContentReviewsApi, type ContentReviewPage } from './content-reviews-api.service';
import { ContentReviewsPageComponent } from './content-reviews-page.component';

describe('ContentReviewsPageComponent live updates', () => {
  it('batches signals and refreshes the current review without clearing its displayed data', async () => {
    const events = new Subject<void>();
    const initial: ContentReviewPage = { groups: [], hasNextPage: true };
    const updated: ContentReviewPage = { groups: [], hasNextPage: false };
    let finishRefresh!: (page: ContentReviewPage) => void;
    const list = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => new Promise<ContentReviewPage>((resolve) => (finishRefresh = resolve)));
    TestBed.configureTestingModule({
      imports: [ContentReviewsPageComponent],
      providers: [
        { provide: ContentReviewsApi, useValue: { list } },
        { provide: RealtimeApiService, useValue: { watchContentReviews: () => events } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ review: 'review-id' })) } },
      ],
    }).overrideComponent(ContentReviewsPageComponent, { set: { template: '' } });

    const fixture = TestBed.createComponent(ContentReviewsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.result()).toEqual(initial);

    events.next();
    events.next();
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list).toHaveBeenLastCalledWith(0, 'review-id');
    expect(fixture.componentInstance.result()).toEqual(initial);
    expect(fixture.componentInstance.loading()).toBe(false);

    finishRefresh(updated);
    await vi.waitFor(() => expect(fixture.componentInstance.result()).toEqual(updated));
    fixture.destroy();
    expect(events.observed).toBe(false);
  });
});
