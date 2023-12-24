import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ScannerPage } from './scanner.page';

describe('ScannerPage', () => {
    let component: ScannerPage;
    let fixture: ComponentFixture<ScannerPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ScannerPage]
        }).compileComponents();

        fixture = TestBed.createComponent(ScannerPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
