import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { DescriptionComponent } from './description.component';

describe('DescriptionComponent', () => {
    let component: DescriptionComponent;
    let fixture: ComponentFixture<DescriptionComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), DescriptionComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(DescriptionComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
