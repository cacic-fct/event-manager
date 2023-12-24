import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ValidateCertificatePage } from './validate-certificate.page';

describe('ValidateCertificatePage', () => {
    let component: ValidateCertificatePage;
    let fixture: ComponentFixture<ValidateCertificatePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ValidateCertificatePage]
        }).compileComponents();

        fixture = TestBed.createComponent(ValidateCertificatePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
