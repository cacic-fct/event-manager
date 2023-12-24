import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { AddMajorEventPage } from './add-major-event.page';

describe('AddMajorEventPage', () => {
    let component: AddMajorEventPage;
    let fixture: ComponentFixture<AddMajorEventPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), AddMajorEventPage]
        }).compileComponents();

        fixture = TestBed.createComponent(AddMajorEventPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
