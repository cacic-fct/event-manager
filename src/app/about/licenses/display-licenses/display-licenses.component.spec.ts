import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { DisplayLicensesComponent } from './display-licenses.component';

describe('DisplayLicensesComponent', () => {
    let component: DisplayLicensesComponent;
    let fixture: ComponentFixture<DisplayLicensesComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), DisplayLicensesComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(DisplayLicensesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
