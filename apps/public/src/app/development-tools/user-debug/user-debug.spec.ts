import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserDebug } from './user-debug';

describe('UserDebug', () => {
  let component: UserDebug;
  let fixture: ComponentFixture<UserDebug>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserDebug],
    }).compileComponents();

    fixture = TestBed.createComponent(UserDebug);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
