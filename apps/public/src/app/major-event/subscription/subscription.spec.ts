import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MajorEventSubscription } from './subscription';

describe('Subscription', () => {
  let component: MajorEventSubscription;
  let fixture: ComponentFixture<MajorEventSubscription>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MajorEventSubscription],
    }).compileComponents();

    fixture = TestBed.createComponent(MajorEventSubscription);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
