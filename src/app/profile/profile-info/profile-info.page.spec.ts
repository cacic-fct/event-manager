import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ProfileInfoPage } from './profile-info.page';

describe('ProfileInfoPage', () => {
    let component: ProfileInfoPage;
    let fixture: ComponentFixture<ProfileInfoPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ProfileInfoPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ProfileInfoPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
