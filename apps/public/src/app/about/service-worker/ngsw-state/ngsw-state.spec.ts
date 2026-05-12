import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NgswState } from './ngsw-state';

describe('NgswState', () => {
  let component: NgswState;
  let fixture: ComponentFixture<NgswState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgswState],
    }).compileComponents();

    fixture = TestBed.createComponent(NgswState);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
