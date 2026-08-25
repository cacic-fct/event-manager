import { BreakpointObserver } from '@angular/cdk/layout';
import type { StepperOrientation, StepperSelectionEvent } from '@angular/cdk/stepper';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, viewChild, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import type { FormElement, FormResponseAnswer } from '@cacic-fct/form-contracts';
import {
  EventFormDescriptionContentComponent,
  EventFormRendererComponent,
  answerValue,
  isRequiredFormAnswerMissing,
  parseFormElementsJson,
} from '@cacic-fct/shared-angular';
import { map } from 'rxjs';
import {
  createSubscriptionFlowDraft,
  subscriptionFormKey,
  type SubscriptionFlowDraft,
  type SubscriptionFormContext,
} from './subscription-flow.models';

@Component({
  selector: 'app-subscription-form-flow',
  imports: [
    EventFormDescriptionContentComponent,
    EventFormRendererComponent,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatStepperModule,
    MatToolbarModule,
  ],
  templateUrl: './subscription-form-flow.html',
  styleUrl: './subscription-form-flow.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionFormFlow {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly stepper = viewChild(MatStepper);
  private readonly formRenderers = viewChildren(EventFormRendererComponent);

  readonly forms = input.required<readonly SubscriptionFormContext[]>();
  readonly requireImageLicenseAgreement = input(false);
  readonly imageLicenseAgreementAccepted = input(false);
  readonly initialDraft = input<SubscriptionFlowDraft | null>(null);
  readonly backToSelection = output<SubscriptionFlowDraft>();
  readonly reviewRequested = output<SubscriptionFlowDraft>();

  readonly activeStepIndex = signal(0);
  readonly validationAttemptedStepIndex = signal<number | null>(null);
  readonly answersByKey = signal<Record<string, FormResponseAnswer[]>>({});
  readonly agreementAccepted = signal(false);
  readonly orientation = toSignal(
    this.breakpointObserver
      .observe('(max-width: 720px)')
      .pipe(map((result): StepperOrientation => (result.matches ? 'vertical' : 'horizontal'))),
    { initialValue: 'horizontal' as StepperOrientation },
  );

  readonly totalSteps = computed(() => this.forms().length + (this.requireImageLicenseAgreement() ? 1 : 0));
  readonly isLastStep = computed(() => this.activeStepIndex() === this.totalSteps() - 1);

  constructor() {
    effect(() => {
      const draft = createSubscriptionFlowDraft(
        this.forms(),
        this.imageLicenseAgreementAccepted(),
        this.initialDraft(),
      );
      this.answersByKey.set(draft.answersByKey);
      this.agreementAccepted.set(draft.imageLicenseAgreementAccepted);
      this.activeStepIndex.set(0);
      this.validationAttemptedStepIndex.set(null);
    });
  }

  formElements(form: PublicEventForm): FormElement[] {
    return parseFormElementsJson(form.elementsJson);
  }

  answersFor(form: SubscriptionFormContext): FormResponseAnswer[] {
    return this.answersByKey()[subscriptionFormKey(form)] ?? [];
  }

  updateFormAnswers(form: SubscriptionFormContext, answers: FormResponseAnswer[]): void {
    this.answersByKey.update((current) => ({
      ...current,
      [subscriptionFormKey(form)]: answers,
    }));
  }

  hasMissingRequired(form: SubscriptionFormContext): boolean {
    if (!form.requiredInSubscriptionFlow) {
      return false;
    }

    const answers = this.answersFor(form);
    return this.formElements(form.form).some((element) =>
      isRequiredFormAnswerMissing(element, answerValue(answers, element.id)),
    );
  }

  isFormComplete(form: SubscriptionFormContext): boolean {
    return !this.hasMissingRequired(form);
  }

  onStepperSelectionChange(event: StepperSelectionEvent): void {
    const currentIndex = this.activeStepIndex();
    if (event.selectedIndex > currentIndex) {
      const stepper = this.stepper();
      if (stepper) {
        stepper.selectedIndex = currentIndex;
      }
      return;
    }

    this.activeStepIndex.set(event.selectedIndex);
    this.validationAttemptedStepIndex.set(null);
  }

  previous(): void {
    const currentIndex = this.activeStepIndex();
    this.validationAttemptedStepIndex.set(null);
    if (currentIndex === 0) {
      this.backToSelection.emit(this.draft());
      return;
    }

    this.activeStepIndex.set(currentIndex - 1);
  }

  next(): void {
    const currentIndex = this.activeStepIndex();
    const currentForm = this.forms()[currentIndex];
    if (currentForm && this.hasMissingRequired(currentForm)) {
      this.validationAttemptedStepIndex.set(currentIndex);
      this.formRenderers()[currentIndex]?.showMissingRequired.set(true);
      return;
    }

    if (this.isAgreementStep(currentIndex) && !this.agreementAccepted()) {
      this.validationAttemptedStepIndex.set(currentIndex);
      return;
    }

    this.validationAttemptedStepIndex.set(null);
    if (this.isLastStep()) {
      this.reviewRequested.emit(this.draft());
      return;
    }

    this.activeStepIndex.set(currentIndex + 1);
  }

  isAgreementStep(index: number): boolean {
    return this.requireImageLicenseAgreement() && index === this.forms().length;
  }

  private draft(): SubscriptionFlowDraft {
    return {
      answersByKey: this.answersByKey(),
      imageLicenseAgreementAccepted: this.agreementAccepted(),
    };
  }
}
