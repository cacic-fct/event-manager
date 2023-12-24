import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { StudentOrganizationsPage } from './student-organizations.page';

describe('StudentOrganizationsPage', () => {
    let component: StudentOrganizationsPage;
    let fixture: ComponentFixture<StudentOrganizationsPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), StudentOrganizationsPage],
        }).compileComponents();

        fixture = TestBed.createComponent(StudentOrganizationsPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
