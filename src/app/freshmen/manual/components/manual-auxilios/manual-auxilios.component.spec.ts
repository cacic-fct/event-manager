import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualAuxiliosComponent } from './manual-auxilios.component';

describe('ManualAuxiliosComponent', () => {
    let component: ManualAuxiliosComponent;
    let fixture: ComponentFixture<ManualAuxiliosComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualAuxiliosComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualAuxiliosComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
