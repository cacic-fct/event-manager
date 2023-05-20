import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule } from '@ionic/angular';

import { EventCardDisplayMainPageComponent } from './event-card-display-main-page.component';

describe('EventCardDisplayMainPageComponent', () => {
  let component: EventCardDisplayMainPageComponent;
  let fixture: ComponentFixture<EventCardDisplayMainPageComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ EventCardDisplayMainPageComponent ],
      imports: [IonicModule.forRoot()]
    }).compileComponents();

    fixture = TestBed.createComponent(EventCardDisplayMainPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
