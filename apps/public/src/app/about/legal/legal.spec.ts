import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Legal } from './legal';

describe('Licenses', () => {
  let component: Legal;
  let fixture: ComponentFixture<Legal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Legal],
    }).compileComponents();

    fixture = TestBed.createComponent(Legal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
