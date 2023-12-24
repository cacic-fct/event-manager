import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { SupportPage } from './support.page';

describe('SupportPage', () => {
    let component: SupportPage;
    let fixture: ComponentFixture<SupportPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), SupportPage],
        }).compileComponents();

        fixture = TestBed.createComponent(SupportPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
