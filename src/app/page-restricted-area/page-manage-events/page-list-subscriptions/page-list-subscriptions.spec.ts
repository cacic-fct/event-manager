import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';
import { PageListSubscriptions } from './page-list-subscriptions';

describe('PageListSubscriptionsComponent', () => {
  let component: PageListSubscriptions;
  let fixture: ComponentFixture<PageListSubscriptions>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [PageListSubscriptions],
      imports: [IonicModule.forRoot()],
    }).compileComponents();

    fixture = TestBed.createComponent(PageListSubscriptions);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
