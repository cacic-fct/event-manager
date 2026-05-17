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
    component = fixture.componentInstance;    fixture.componentRef.setInput('title', 'Test Title');
    fixture.componentRef.setInput('icon', 'info');
    fixture.detectChanges();    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
