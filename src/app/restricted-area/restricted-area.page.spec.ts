import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { RestrictedAreaPage } from './restricted-area.page';

describe('RestrictedAreaPage', () => {
    let component: RestrictedAreaPage;
    let fixture: ComponentFixture<RestrictedAreaPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), RestrictedAreaPage],
        }).compileComponents();

        fixture = TestBed.createComponent(RestrictedAreaPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
