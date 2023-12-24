import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { PageManageEvents } from './manage-events.page';

describe('PageManageEventsComponent', () => {
    let component: PageManageEvents;
    let fixture: ComponentFixture<PageManageEvents>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), PageManageEvents],
        }).compileComponents();

        fixture = TestBed.createComponent(PageManageEvents);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
