import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { EventExtrasComponent } from './event-extras';

describe('EventExtrasComponent deferred demos', () => {
  it('loads sports and feedback independently and delays operations until requested', async () => {
    await TestBed.configureTestingModule({
      imports: [EventExtrasComponent],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    }).compileComponents();
    const fixture = TestBed.createComponent(EventExtrasComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const [sports, feedback] = await fixture.getDeferBlocks();

    expect(element.querySelector('app-landing-sports-demo')).toBeNull();
    expect(element.querySelector('app-landing-feedback-demo')).toBeNull();
    await sports.render(DeferBlockState.Complete);
    expect(element.querySelector('app-landing-sports-demo')).not.toBeNull();
    expect(element.querySelector('app-landing-feedback-demo')).toBeNull();
    expect(element.querySelector('app-landing-match-operations-demo')).toBeNull();

    await feedback.render(DeferBlockState.Complete);
    expect(element.querySelector('app-landing-feedback-demo')).not.toBeNull();
  });
});
