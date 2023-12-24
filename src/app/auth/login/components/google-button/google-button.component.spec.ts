import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { GoogleButtonComponent } from './google-button.component';

describe('GoogleButtonComponent', () => {
    let component: GoogleButtonComponent;
    let fixture: ComponentFixture<GoogleButtonComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), GoogleButtonComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(GoogleButtonComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
