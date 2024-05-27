import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { NotLinkedDataComponent } from './not-linked-data.component';

describe('NotLinkedDataComponent', () => {
  let component: NotLinkedDataComponent;
  let fixture: ComponentFixture<NotLinkedDataComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [NotLinkedDataComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(NotLinkedDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
