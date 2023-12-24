import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { PrivacyPolicyPage } from './privacy-policy.page';

describe('PrivacyPolicyPage', () => {
    let component: PrivacyPolicyPage;
    let fixture: ComponentFixture<PrivacyPolicyPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), PrivacyPolicyPage],
        }).compileComponents();

        fixture = TestBed.createComponent(PrivacyPolicyPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
