import { TestBed } from '@angular/core/testing';
import { TicketPersonSummaryComponent } from './ticket-person-summary.component';

describe('ticket identity avatar recovery', () => {
  it('falls back to initials after an image failure and retries when the avatar changes', async () => {
    await TestBed.configureTestingModule({ imports: [TicketPersonSummaryComponent] }).compileComponents();
    const fixture = TestBed.createComponent(TicketPersonSummaryComponent);
    fixture.componentRef.setInput('fullName', 'Marina da Silva');
    fixture.componentRef.setInput('avatarUrl', '/first-avatar.png');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    image.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.person-avatar').textContent).toContain('MS');

    fixture.componentRef.setInput('avatarUrl', '/second-avatar.png');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')?.getAttribute('src')).toBe('/second-avatar.png');
  });
});
