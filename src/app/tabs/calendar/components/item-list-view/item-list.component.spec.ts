import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { ItemListViewComponent } from './item-list.component';

describe('ItemListComponent', () => {
    let component: ItemListViewComponent;
    let fixture: ComponentFixture<ItemListViewComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), ItemListViewComponent],
        }).compileComponents();

        fixture = TestBed.createComponent(ItemListViewComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
