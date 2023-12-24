import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { DevelopmentToolsPage } from './development-tools.page';

describe('DevelopmentToolsPage', () => {
    let component: DevelopmentToolsPage;
    let fixture: ComponentFixture<DevelopmentToolsPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), DevelopmentToolsPage]
        }).compileComponents();

        fixture = TestBed.createComponent(DevelopmentToolsPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
