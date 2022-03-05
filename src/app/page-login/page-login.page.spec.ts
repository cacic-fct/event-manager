import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PageLoginPage } from './page-login.page';

describe('PageLoginPage', () => {
  let component: PageLoginPage;
  let fixture: ComponentFixture<PageLoginPage>;

  beforeEach(
    waitForAsync(() => {
      TestBed.configureTestingModule({
        declarations: [PageLoginPage],
        imports: [IonicModule.forRoot()],
      }).compileComponents();

      fixture = TestBed.createComponent(PageLoginPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    })
  );

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
