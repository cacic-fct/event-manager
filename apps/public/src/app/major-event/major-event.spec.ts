import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MajorEvent } from './major-event';

describe('MajorEvent', () => {
  let component: MajorEvent;
  let fixture: ComponentFixture<MajorEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MajorEvent],
    }).compileComponents();

    fixture = TestBed.createComponent(MajorEvent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
