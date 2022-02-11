import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { TabMapPage } from './tab-map.page';

describe('TabMapPage', () => {
  let component: TabMapPage;
  let fixture: ComponentFixture<TabMapPage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [TabMapPage],
        imports: [IonicModule.forRoot(), ExploreContainerComponentModule],
      }).compileComponents();

      fixture = TestBed.createComponent(TabMapPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
