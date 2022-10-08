import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageConfirmAttendance } from './page-confirm-attendance';

describe('PageConfirmAttendanceComponent', () => {
  let component: PageConfirmAttendance;
  let fixture: ComponentFixture<PageConfirmAttendance>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [PageConfirmAttendance],
      imports: [IonicModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(PageConfirmAttendance);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
