import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ConfirmModalPage } from './confirm-modal.page';

describe('ConfirmModalPage', () => {
    let component: ConfirmModalPage;
    let fixture: ComponentFixture<ConfirmModalPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ConfirmModalPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ConfirmModalPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
