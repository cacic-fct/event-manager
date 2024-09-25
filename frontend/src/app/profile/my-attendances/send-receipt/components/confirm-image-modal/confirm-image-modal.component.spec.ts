import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ConfirmImageModalComponent } from './confirm-image-modal.component';

describe('ConfirmImageModalComponent', () => {
  let component: ConfirmImageModalComponent;
  let fixture: ComponentFixture<ConfirmImageModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ConfirmImageModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfirmImageModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
