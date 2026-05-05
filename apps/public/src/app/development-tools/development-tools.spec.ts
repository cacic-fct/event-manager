import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DevelopmentTools } from './development-tools';

describe('DevelopmentTools', () => {
  let component: DevelopmentTools;
  let fixture: ComponentFixture<DevelopmentTools>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DevelopmentTools],
    }).compileComponents();

    fixture = TestBed.createComponent(DevelopmentTools);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
