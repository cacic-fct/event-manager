import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { AddEventPage } from './add-event.page';

describe('AddEventPage', () => {
    let component: AddEventPage;
    let fixture: ComponentFixture<AddEventPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), AddEventPage],
        }).compileComponents();

        fixture = TestBed.createComponent(AddEventPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
