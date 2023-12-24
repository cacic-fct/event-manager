import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { LicensesPage } from './licenses.page';

describe('PageLegalPage', () => {
    let component: LicensesPage;
    let fixture: ComponentFixture<LicensesPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), LicensesPage],
        }).compileComponents();

        fixture = TestBed.createComponent(LicensesPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
