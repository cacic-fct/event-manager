import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ManageMajorEventsPage } from './manage-major-events.page';

describe('PageListMajorEventsPage', () => {
    let component: ManageMajorEventsPage;
    let fixture: ComponentFixture<ManageMajorEventsPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ManageMajorEventsPage],
        }).compileComponents();

        fixture = TestBed.createComponent(ManageMajorEventsPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
