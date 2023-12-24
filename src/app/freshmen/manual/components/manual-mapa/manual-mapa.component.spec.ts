import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualMapaComponent } from './manual-mapa.component';

describe('ManualMapaComponent', () => {
    let component: ManualMapaComponent;
    let fixture: ComponentFixture<ManualMapaComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualMapaComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualMapaComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
