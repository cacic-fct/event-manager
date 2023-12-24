import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { DateComponent } from './date.component';

describe('DateComponent', () => {
    let component: DateComponent;
    let fixture: ComponentFixture<DateComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), DateComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(DateComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
