import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageManualCalouroPage } from './page-manual-calouro.page';

describe('PageManualCalouroPage', () => {
  let component: PageManualCalouroPage;
  let fixture: ComponentFixture<PageManualCalouroPage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [PageManualCalouroPage],
        imports: [IonicModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(PageManualCalouroPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
