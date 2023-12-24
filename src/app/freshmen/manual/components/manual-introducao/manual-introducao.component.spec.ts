import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualIntroducaoComponent } from './manual-introducao.component';

describe('ManualIntroducaoComponent', () => {
    let component: ManualIntroducaoComponent;
    let fixture: ComponentFixture<ManualIntroducaoComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualIntroducaoComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ManualIntroducaoComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
