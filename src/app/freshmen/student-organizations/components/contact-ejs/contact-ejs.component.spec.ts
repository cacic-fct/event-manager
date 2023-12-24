import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ContactEjsComponent } from './contact-ejs.component';

describe('ContactEjsComponent', () => {
    let component: ContactEjsComponent;
    let fixture: ComponentFixture<ContactEjsComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ContactEjsComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ContactEjsComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
