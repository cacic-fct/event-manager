import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { PageQrScannerPage } from './page-qr-scanner.page';

describe('PageQrScannerPage', () => {
    let component: PageQrScannerPage;
    let fixture: ComponentFixture<PageQrScannerPage>;

    beforeEach(
        waitForAsync(() => {
            TestBed.configureTestingModule({
                declarations: [PageQrScannerPage],
                imports: [IonicModule.forRoot()],
            }).compileComponents();

            fixture = TestBed.createComponent(PageQrScannerPage);
            component = fixture.componentInstance;
            fixture.detectChanges();
        })
    );

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
