import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CalendarListViewComponent } from './calendar-list-view.component';

describe('CalendarListViewComponent', () => {
    let component: CalendarListViewComponent;
    let fixture: ComponentFixture<CalendarListViewComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), CalendarListViewComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(CalendarListViewComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
