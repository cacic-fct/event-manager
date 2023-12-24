import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManageSubscriptionPage } from './manage-subscription.page';

describe('ManageSubscriptionPage', () => {
    let component: ManageSubscriptionPage;
    let fixture: ComponentFixture<ManageSubscriptionPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManageSubscriptionPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ManageSubscriptionPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
