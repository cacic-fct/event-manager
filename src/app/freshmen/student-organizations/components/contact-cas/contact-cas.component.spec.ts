import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ContactCasComponent } from './contact-cas.component';

describe('ContactCasComponent', () => {
    let component: ContactCasComponent;
    let fixture: ComponentFixture<ContactCasComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ContactCasComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ContactCasComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
