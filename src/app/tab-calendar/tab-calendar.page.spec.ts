import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { TabCalendarPage } from './tab-calendar.page';

describe('TabCalendarPage', () => {
  let component: TabCalendarPage;
  let fixture: ComponentFixture<TabCalendarPage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [TabCalendarPage],
        imports: [IonicModule.forRoot(), ExploreContainerComponentModule],
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
