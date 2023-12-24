import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualGlossarioComponent } from './manual-glossario.component';

describe('ManualGlossarioComponent', () => {
    let component: ManualGlossarioComponent;
    let fixture: ComponentFixture<ManualGlossarioComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualGlossarioComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualGlossarioComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
