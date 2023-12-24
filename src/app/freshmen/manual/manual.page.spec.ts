import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManualPage } from './manual.page';

describe('ManualPage', () => {
    let component: ManualPage;
    let fixture: ComponentFixture<ManualPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManualPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ManualPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
