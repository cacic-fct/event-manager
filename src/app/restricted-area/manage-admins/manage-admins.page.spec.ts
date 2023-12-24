import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManageAdminsPage } from './manage-admins.page';

describe('ManageAdminsPage', () => {
    let component: ManageAdminsPage;
    let fixture: ComponentFixture<ManageAdminsPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManageAdminsPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ManageAdminsPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
