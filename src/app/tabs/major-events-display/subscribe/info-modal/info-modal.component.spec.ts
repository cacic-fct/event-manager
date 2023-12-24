import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { InfoModalComponent } from './info-modal.component';

describe('InfoModalComponent', () => {
    let component: InfoModalComponent;
    let fixture: ComponentFixture<InfoModalComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), InfoModalComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(InfoModalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
