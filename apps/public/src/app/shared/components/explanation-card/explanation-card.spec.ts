import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExplanationCard } from './explanation-card';

describe('ExplanationCard', () => {
  let component: ExplanationCard;
  let fixture: ComponentFixture<ExplanationCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExplanationCard],
    }).compileComponents();

    fixture = TestBed.createComponent(ExplanationCard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
