import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { NEVER, of, Subject } from 'rxjs';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { ContentReviewsApi, type ContentReviewPage } from './content-reviews-api.service';
import { ContentReviewsPageComponent } from './content-reviews-page.component';

describe('ContentReviewsPageComponent live updates', () => {
  it('confirms a material editing block for the selected proposal and keeps it in the queue', async () => {
    const group = {
      id: 'review-id',
      revision: 2,
      updatedAt: new Date().toISOString(),
      targetName: 'Oficina',
      isProfile: false,
      items: [
        {
          key: 'slides',
          authorName: 'Ana',
          authorEditingBlocked: false,
          fields: [],
          beforeMaterial: null,
          afterMaterial: { title: 'Slides', url: 'https://example.org/slides' },
        },
      ],
    };
    const list = vi
      .fn()
      .mockResolvedValueOnce({ groups: [group], hasNextPage: false })
      .mockResolvedValueOnce({
        groups: [{ ...group, items: [{ ...group.items[0], authorEditingBlocked: true }] }],
        hasNextPage: false,
      });
    const blockEditing = vi.fn().mockResolvedValue(undefined);
    const open = vi
      .fn()
      .mockReturnValueOnce({ afterClosed: () => of(false) })
      .mockReturnValueOnce({ afterClosed: () => of(true) });
    TestBed.configureTestingModule({
      imports: [ContentReviewsPageComponent],
      providers: [
        provideRouter([]),
        { provide: ContentReviewsApi, useValue: { list, blockEditing } },
        { provide: RealtimeApiService, useValue: { watchContentReviews: () => NEVER } },
        { provide: MatDialog, useValue: { open } },
      ],
    });

    const fixture = TestBed.createComponent(ContentReviewsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const button = root.querySelector<HTMLButtonElement>('button[aria-label="Bloquear edição de materiais para Ana"]');
    expect(button).not.toBeNull();
    button?.click();
    await fixture.whenStable();
    expect(blockEditing).not.toHaveBeenCalled();
    button?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        data: expect.objectContaining({ message: expect.stringContaining('todos os eventos') }),
      }),
    );
    expect(blockEditing).toHaveBeenCalledWith(group, 'slides');
    expect(root.textContent).toContain('Edição de materiais bloqueada para Ana.');
    expect(root.textContent).toContain('Slides');
  });

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
