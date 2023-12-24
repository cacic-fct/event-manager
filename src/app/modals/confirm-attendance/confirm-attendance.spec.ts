import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ConfirmAttendancePage } from './confirm-attendance';

describe('ConfirmAttendancePageComponent', () => {
    let component: ConfirmAttendancePage;
    let fixture: ComponentFixture<ConfirmAttendancePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ConfirmAttendancePage],
        }).compileComponents();

        fixture = TestBed.createComponent(ConfirmAttendancePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
