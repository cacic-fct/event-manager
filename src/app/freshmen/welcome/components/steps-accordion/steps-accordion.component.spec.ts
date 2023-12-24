import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { StepsAccordionComponent } from './steps-accordion.component';

describe('StepsAccordionComponent', () => {
    let component: StepsAccordionComponent;
    let fixture: ComponentFixture<StepsAccordionComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), StepsAccordionComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(StepsAccordionComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
