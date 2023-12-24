import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { PopulateDatabasePage } from './populate-database.page';

describe('PopulateDatabasePage', () => {
    let component: PopulateDatabasePage;
    let fixture: ComponentFixture<PopulateDatabasePage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), PopulateDatabasePage]
        }).compileComponents();

        fixture = TestBed.createComponent(PopulateDatabasePage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
