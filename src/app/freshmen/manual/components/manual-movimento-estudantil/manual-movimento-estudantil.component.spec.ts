import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualMovimentoEstudantilComponent } from './manual-movimento-estudantil.component';

describe('ManualMovimentoEstudantilComponent', () => {
    let component: ManualMovimentoEstudantilComponent;
    let fixture: ComponentFixture<ManualMovimentoEstudantilComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualMovimentoEstudantilComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualMovimentoEstudantilComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
