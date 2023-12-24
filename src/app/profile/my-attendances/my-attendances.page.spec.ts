import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MyAttendancesPage } from './my-attendances.page';

describe('MyAttendancesPage', () => {
    let component: MyAttendancesPage;
    let fixture: ComponentFixture<MyAttendancesPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), MyAttendancesPage],
        }).compileComponents();

        fixture = TestBed.createComponent(MyAttendancesPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
