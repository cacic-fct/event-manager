import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { PagePrivacyPolicyPage } from './page-privacy-policy.page';

describe('PagePrivacyPolicyPage', () => {
  let component: PagePrivacyPolicyPage;
  let fixture: ComponentFixture<PagePrivacyPolicyPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ PagePrivacyPolicyPage ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(PagePrivacyPolicyPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
