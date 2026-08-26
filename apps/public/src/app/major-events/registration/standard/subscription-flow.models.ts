import type { EventFormTargetType, PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
import type { FormResponseAnswer } from '@cacic-fct/form-contracts';

export interface SubscriptionFormContext {
  form: PublicEventForm;
  targetType: EventFormTargetType;
  targetId: string;
  targetName: string;
  linkId: string | null;
  requiredInSubscriptionFlow: boolean;
  initialAnswers: FormResponseAnswer[];
  submitted: boolean;
  editable: boolean;
}

export interface SubscriptionFormAnswer {
  formId: string;
  linkId: string | null;
  targetType: EventFormTargetType;
  targetId: string;
  answers: FormResponseAnswer[];
}

export interface SubscriptionFlowDraft {
  answersByKey: Record<string, FormResponseAnswer[]>;
  imageLicenseAgreementAccepted: boolean;
}

export interface SubscriptionFlowSourceDescriptor<TTargetType extends string = EventFormTargetType> {
  key: string;
  kind: string;
  order: number;
  targetType: TTargetType;
  targetId: string;
  targetName: string;
}

export function orderSubscriptionFlowSources<TSource extends SubscriptionFlowSourceDescriptor<string>>(
  sources: readonly TSource[],
): TSource[] {
  return [...sources].sort((left, right) => left.order - right.order || left.key.localeCompare(right.key));
}

export function subscriptionFormKey(form: SubscriptionFormContext): string {
  return `${form.form.id}:${form.linkId ?? 'sem-vinculo'}:${form.targetType}:${form.targetId}`;
}

export function subscriptionFlowSourceKey(source: { targetType: string; targetId: string }): string {
  return `${source.targetType}:${source.targetId}`;
}

export function createSubscriptionFlowDraft(
  forms: readonly SubscriptionFormContext[],
  imageLicenseAgreementAccepted: boolean,
  previous?: SubscriptionFlowDraft | null,
): SubscriptionFlowDraft {
  return {
    answersByKey: Object.fromEntries(
      forms.map((form) => {
        const key = subscriptionFormKey(form);
        return [key, previous?.answersByKey[key] ?? form.initialAnswers];
      }),
    ),
    imageLicenseAgreementAccepted: previous?.imageLicenseAgreementAccepted ?? imageLicenseAgreementAccepted,
  };
}

export function toSubscriptionFormAnswers(
  forms: readonly SubscriptionFormContext[],
  draft: SubscriptionFlowDraft,
): SubscriptionFormAnswer[] {
  return forms
    .map((form) => ({
      form,
      answers: draft.answersByKey[subscriptionFormKey(form)] ?? [],
    }))
    .filter(({ form, answers }) => form.requiredInSubscriptionFlow || answers.length > 0)
    .filter(({ form }) => !form.submitted || form.editable)
    .map(({ form, answers }) => ({
      formId: form.form.id,
      linkId: form.linkId,
      targetType: form.targetType,
      targetId: form.targetId,
      answers,
    }));
}
