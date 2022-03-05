import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageLicensesTableComponent } from './page-licenses-table.component';

describe('PageAcknowledgementsTableComponent', () => {
  let component: PageLicensesTableComponent;
  let fixture: ComponentFixture<PageLicensesTableComponent>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [PageLicensesTableComponent],
        imports: [IonicModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(PageLicensesTableComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
