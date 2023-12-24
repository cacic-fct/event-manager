import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { EventInfoDisplayPage } from './event-info-display.page';

describe('EventInfoDisplayPage', () => {
    let component: EventInfoDisplayPage;
    let fixture: ComponentFixture<EventInfoDisplayPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), EventInfoDisplayPage],
        }).compileComponents();

        fixture = TestBed.createComponent(EventInfoDisplayPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
