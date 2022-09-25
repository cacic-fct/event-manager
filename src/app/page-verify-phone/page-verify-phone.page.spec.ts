import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageVerifyPhonePage } from './page-verify-phone.page';

describe('PageVerifyPhonePage', () => {
  let component: PageVerifyPhonePage;
  let fixture: ComponentFixture<PageVerifyPhonePage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [PageVerifyPhonePage],
        imports: [IonicModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(PageVerifyPhonePage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
