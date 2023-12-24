import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CalendarPage } from './calendar.page';

describe('CalendarPage', () => {
    let component: CalendarPage;
    let fixture: ComponentFixture<CalendarPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), CalendarPage],
        }).compileComponents();

        fixture = TestBed.createComponent(CalendarPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
