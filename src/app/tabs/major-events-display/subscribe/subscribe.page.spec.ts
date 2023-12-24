import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { SubscribePage } from './subscribe.page';

describe('SubscribePage', () => {
    let component: SubscribePage;
    let fixture: ComponentFixture<SubscribePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), SubscribePage],
        }).compileComponents();

        fixture = TestBed.createComponent(SubscribePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
