import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { StepperSelectionEvent } from '@angular/cdk/stepper';
import { SubscriptionFormFlow } from './subscription-form-flow';
import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import type { SubscriptionFlowDraft } from './subscription-flow.models';

describe('SubscriptionFormFlow', () => {
  it('guards forward navigation, preserves answers when going back, and keeps the contract last', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionFormFlow],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    const forms = createSubscriptionFlowFormFixtures();
    const fixture = TestBed.createComponent(SubscriptionFormFlow);
    fixture.componentRef.setInput('forms', forms);
    fixture.componentRef.setInput('requireImageLicenseAgreement', true);
    fixture.componentRef.setInput('imageLicenseAgreementAccepted', false);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const reviewDrafts: SubscriptionFlowDraft[] = [];
    component.reviewRequested.subscribe((draft) => reviewDrafts.push(draft));

    component.next();
    expect(component.activeStepIndex()).toBe(0);
    expect(component.validationAttemptedStepIndex()).toBe(0);

    component.updateFormAnswers(forms[0], [{ elementId: 'shirt-size', value: 'm' }]);
    component.next();
    expect(component.activeStepIndex()).toBe(1);

    component.updateFormAnswers(forms[1], [{ elementId: 'meal', value: 'yes' }]);
    component.next();
    expect(component.activeStepIndex()).toBe(2);
    expect(component.isAgreementStep(2)).toBe(true);

    component.previous();
    expect(component.activeStepIndex()).toBe(1);
    expect(component.answersFor(forms[0])).toEqual([{ elementId: 'shirt-size', value: 'm' }]);
    expect(component.answersFor(forms[1])).toEqual([{ elementId: 'meal', value: 'yes' }]);

    component.onStepperSelectionChange({ selectedIndex: 2 } as StepperSelectionEvent);
    expect(component.activeStepIndex()).toBe(1);

    component.next();
    component.next();
    expect(reviewDrafts).toHaveLength(0);
    expect(component.validationAttemptedStepIndex()).toBe(2);

    component.agreementAccepted.set(true);
    component.next();
    expect(reviewDrafts).toEqual([
      {
        answersByKey: {
          'form-shirt:link-shirt:MAJOR_EVENT:major-1': [{ elementId: 'shirt-size', value: 'm' }],
          'form-meal:link-meal:EVENT:event-1': [{ elementId: 'meal', value: 'yes' }],
        },
        imageLicenseAgreementAccepted: true,
      },
    ]);
  });

  it('returns the current draft when the user goes back to event selection', async () => {
    await TestBed.configureTestingModule({
      imports: [SubscriptionFormFlow],
      providers: [provideNoopAnimations()],
    }).compileComponents();

    const [form] = createSubscriptionFlowFormFixtures();
    const fixture = TestBed.createComponent(SubscriptionFormFlow);
    fixture.componentRef.setInput('forms', [form]);
    fixture.componentRef.setInput('requireImageLicenseAgreement', false);
    fixture.detectChanges();
    await fixture.whenStable();

    const drafts: SubscriptionFlowDraft[] = [];
    fixture.componentInstance.backToSelection.subscribe((draft) => drafts.push(draft));
    fixture.componentInstance.updateFormAnswers(form, [{ elementId: 'shirt-size', value: 'g' }]);
    fixture.componentInstance.previous();

    expect(drafts[0].answersByKey['form-shirt:link-shirt:MAJOR_EVENT:major-1']).toEqual([
      { elementId: 'shirt-size', value: 'g' },
    ]);
  });
});
