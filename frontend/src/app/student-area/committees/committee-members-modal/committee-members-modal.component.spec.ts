import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { CommitteeMembersModalComponent } from './committee-members-modal.component';

describe('CommitteeMembersModalComponent', () => {
  let component: CommitteeMembersModalComponent;
  let fixture: ComponentFixture<CommitteeMembersModalComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [CommitteeMembersModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CommitteeMembersModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
