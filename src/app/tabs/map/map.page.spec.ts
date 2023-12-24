import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MapPage } from './map.page';

describe('MapPage', () => {
    let component: MapPage;
    let fixture: ComponentFixture<MapPage>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), MapPage],
        }).compileComponents();

        fixture = TestBed.createComponent(MapPage);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
