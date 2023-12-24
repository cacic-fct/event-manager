import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IssueCertificatePage } from './issue-certificate.page';

describe('IssueCertificatePage', () => {
    let component: IssueCertificatePage;
    let fixture: ComponentFixture<IssueCertificatePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), IssueCertificatePage]
        }).compileComponents();

        fixture = TestBed.createComponent(IssueCertificatePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
