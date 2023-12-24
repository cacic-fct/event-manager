import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ListCertificatesComponent } from './list-certificates.component';

describe('ListCertificatesComponent', () => {
    let component: ListCertificatesComponent;
    let fixture: ComponentFixture<ListCertificatesComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ListCertificatesComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ListCertificatesComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
