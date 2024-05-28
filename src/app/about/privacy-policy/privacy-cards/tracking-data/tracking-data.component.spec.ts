import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { TrackingDataComponent } from './tracking-data.component';

describe('TrackingDataComponent', () => {
  let component: TrackingDataComponent;
  let fixture: ComponentFixture<TrackingDataComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [TrackingDataComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TrackingDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
