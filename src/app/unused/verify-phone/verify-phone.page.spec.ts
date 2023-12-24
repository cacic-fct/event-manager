import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { VerifyPhonePage } from './verify-phone.page';

describe('VerifyPhonePage', () => {
    let component: VerifyPhonePage;
    let fixture: ComponentFixture<VerifyPhonePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            declarations: [VerifyPhonePage],
            imports: [IonicModule.forRoot()],
        }).compileComponents();

        fixture = TestBed.createComponent(VerifyPhonePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
