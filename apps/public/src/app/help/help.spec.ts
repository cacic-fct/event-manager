import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Help } from './help';

describe('Help', () => {
  let component: Help;
  let fixture: ComponentFixture<Help>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Help],
    }).compileComponents();

    fixture = TestBed.createComponent(Help);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
