import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { PrivacyCardsComponent } from './privacy-cards.component';

describe('PrivacyCardsComponent', () => {
  let component: PrivacyCardsComponent;
  let fixture: ComponentFixture<PrivacyCardsComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [PrivacyCardsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PrivacyCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
