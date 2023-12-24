import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualSobreFctComponent } from './manual-sobre-fct.component';

describe('ManualSobreFctComponent', () => {
    let component: ManualSobreFctComponent;
    let fixture: ComponentFixture<ManualSobreFctComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualSobreFctComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualSobreFctComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
