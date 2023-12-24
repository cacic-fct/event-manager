import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ValidateReceiptPage } from './validate-receipt.page';

describe('ValidateReceiptPage', () => {
    let component: ValidateReceiptPage;
    let fixture: ComponentFixture<ValidateReceiptPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ValidateReceiptPage]
        }).compileComponents();

        fixture = TestBed.createComponent(ValidateReceiptPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
