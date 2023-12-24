import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualPresidentePrudenteComponent } from './manual-presidente-prudente.component';

describe('ManualPresidentePrudenteComponent', () => {
    let component: ManualPresidentePrudenteComponent;
    let fixture: ComponentFixture<ManualPresidentePrudenteComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualPresidentePrudenteComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualPresidentePrudenteComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
