import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MoreInfoPage } from './more-info.page';

describe('MoreInfoPage', () => {
    let component: MoreInfoPage;
    let fixture: ComponentFixture<MoreInfoPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), MoreInfoPage],
        }).compileComponents();

        fixture = TestBed.createComponent(MoreInfoPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
