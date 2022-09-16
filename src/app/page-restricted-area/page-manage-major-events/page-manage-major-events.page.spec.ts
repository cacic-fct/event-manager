import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageManageMajorEventsPage } from './page-manage-major-events.page';

describe('PageListMajorEventsPage', () => {
  let component: PageManageMajorEventsPage;
  let fixture: ComponentFixture<PageManageMajorEventsPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [PageManageMajorEventsPage],
      imports: [IonicModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(PageManageMajorEventsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
