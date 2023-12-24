import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { FaqAccordionComponent } from './faq-accordion.component';

describe('FaqAccordionComponent', () => {
    let component: FaqAccordionComponent;
    let fixture: ComponentFixture<FaqAccordionComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), FaqAccordionComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(FaqAccordionComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
