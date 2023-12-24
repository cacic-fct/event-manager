import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { CertificatePreviewModalComponent } from './certificate-preview-modal.component';

describe('CertificatePreviewModalComponent', () => {
    let component: CertificatePreviewModalComponent;
    let fixture: ComponentFixture<CertificatePreviewModalComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), CertificatePreviewModalComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(CertificatePreviewModalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
