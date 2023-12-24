import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { WelcomePage } from './welcome.page';

describe('WelcomePage', () => {
    let component: WelcomePage;
    let fixture: ComponentFixture<WelcomePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), WelcomePage],
        }).compileComponents();

        fixture = TestBed.createComponent(WelcomePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
