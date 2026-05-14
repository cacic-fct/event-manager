import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Developer } from './developer';

describe('Developer', () => {
  let component: Developer;
  let fixture: ComponentFixture<Developer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Developer],
    }).compileComponents();

    fixture = TestBed.createComponent(Developer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
