import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { GroupCreationModalComponent } from './group-creation-modal.component';

describe('GroupCreationModalComponent', () => {
    let component: GroupCreationModalComponent;
    let fixture: ComponentFixture<GroupCreationModalComponent>;

    beforeEach(waitForAsync(() => {
        TestBed.configureTestingModule({
            imports: [IonicModule.forRoot(), GroupCreationModalComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(GroupCreationModalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    }));

    it('should create', () => {
        expect(component).toBeTruthy();
    });
});
