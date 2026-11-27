import { TestBed } from '@angular/core/testing';
import { ReviewQueuePaginationComponent } from './review-queue-pagination.component';
import { ReviewTextComparisonComponent } from './review-text-comparison.component';

describe('shared review queue components', () => {
  it('renders nullable and untrusted review text without interpreting markup', () => {
    TestBed.configureTestingModule({ imports: [ReviewTextComparisonComponent] });
    const fixture = TestBed.createComponent(ReviewTextComparisonComponent);
    fixture.componentRef.setInput('before', null);
    fixture.componentRef.setInput('after', '<img src=x onerror=alert(1)>');
    fixture.componentRef.setInput('afterLabel', 'Publicado');
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.textContent).toContain('Sem valor');
    expect(root.textContent).toContain('Publicado');
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
  });

  it('hides single-page navigation and emits bounded requests while respecting busy state', () => {
    TestBed.configureTestingModule({ imports: [ReviewQueuePaginationComponent] });
    const fixture = TestBed.createComponent(ReviewQueuePaginationComponent);
    fixture.componentRef.setInput('page', 0);
    fixture.componentRef.setInput('hasNextPage', false);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('nav')).toBeNull();
    const requested = vi.fn();
    fixture.componentInstance.pageChange.subscribe(requested);
    fixture.componentRef.setInput('hasNextPage', true);
    fixture.detectChanges();
    const buttons = root.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0].disabled).toBe(true);
    buttons[1].click();
    expect(requested).toHaveBeenCalledWith(1);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(buttons[1].disabled).toBe(true);
  });
});
