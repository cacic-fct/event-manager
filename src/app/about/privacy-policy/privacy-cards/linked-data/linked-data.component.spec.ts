import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { LinkedDataComponent } from './linked-data.component';

describe('LinkedDataComponent', () => {
  let component: LinkedDataComponent;
  let fixture: ComponentFixture<LinkedDataComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [LinkedDataComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(LinkedDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
