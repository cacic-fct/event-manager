import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { SendReceiptPage } from './send-receipt.page';

describe('SendReceiptPage', () => {
    let component: SendReceiptPage;
    let fixture: ComponentFixture<SendReceiptPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), SendReceiptPage],
        }).compileComponents();

        fixture = TestBed.createComponent(SendReceiptPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
