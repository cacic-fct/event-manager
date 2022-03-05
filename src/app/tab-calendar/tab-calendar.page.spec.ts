import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { TabCalendarPage } from './tab-calendar.page';

describe('TabCalendarPage', () => {
  let component: TabCalendarPage;
  let fixture: ComponentFixture<TabCalendarPage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [TabCalendarPage],
        imports: [IonicModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(TabCalendarPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
