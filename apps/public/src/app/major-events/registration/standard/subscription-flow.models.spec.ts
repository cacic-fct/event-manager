import { createSubscriptionFlowFormFixtures } from './subscription-flow.fixtures';
import {
  createMajorEventSubscriptionFlowSources,
  createSubscriptionFlowDraft,
  orderSubscriptionFlowSources,
  subscriptionFormKey,
  toSubmitSubscriptionFormResponses,
  toSubscriptionFormAnswers,
} from './subscription-flow.models';

describe('subscription flow models', () => {
  it('orders heterogeneous sources through reusable descriptors', () => {
    const sources = orderSubscriptionFlowSources([
      {
        key: 'sports',
        kind: 'sports-form',
        order: 2,
        targetType: 'SPORTS',
        targetId: 'sports-1',
        targetName: 'Esportes',
      },
      { key: 'events', kind: 'event-forms', order: 1, targetType: 'EVENT', targetId: 'event-1', targetName: 'Eventos' },
      {
        key: 'major',
        kind: 'major-event-forms',
        order: 0,
        targetType: 'MAJOR_EVENT',
        targetId: 'major-1',
        targetName: 'SECOMPP',
      },
    ]);

    expect(sources.map((source) => source.key)).toEqual(['major', 'events', 'sports']);
  });

  it('builds major-event sources before selected events', () => {
    const sources = createMajorEventSubscriptionFlowSources(
      { id: 'major-1', name: 'SECOMPP' },
      [
        { id: 'event-2', name: 'GraphQL' },
        { id: 'event-1', name: 'Angular' },
      ],
    );

    expect(sources.map((source) => source.key)).toEqual(['major-event:major-1', 'event:event-2', 'event:event-1']);
  });

  it('retains matching draft answers while discarding forms no longer in the flow', () => {
    const [shirtForm, mealForm] = createSubscriptionFlowFormFixtures();
    const previous = {
      answersByKey: {
        [subscriptionFormKey(shirtForm)]: [{ elementId: 'shirt-size', value: 'gg' }],
        'removed-form:removed-link:EVENT:removed-event': [{ elementId: 'removed', value: 'old' }],
      },
      imageLicenseAgreementAccepted: true,
    };

    const draft = createSubscriptionFlowDraft([shirtForm, mealForm], false, previous);

    expect(draft.answersByKey[subscriptionFormKey(shirtForm)]).toEqual([{ elementId: 'shirt-size', value: 'gg' }]);
    expect(draft.answersByKey[subscriptionFormKey(mealForm)]).toEqual([]);
    expect(draft.answersByKey['removed-form:removed-link:EVENT:removed-event']).toBeUndefined();
    expect(draft.imageLicenseAgreementAccepted).toBe(true);
  });

  it('builds only form responses that must be submitted', () => {
    const [requiredForm, submittedForm] = createSubscriptionFlowFormFixtures();
    submittedForm.submitted = true;
    submittedForm.editable = false;
    const draft = createSubscriptionFlowDraft([requiredForm, submittedForm], false);
    draft.answersByKey[subscriptionFormKey(requiredForm)] = [{ elementId: 'shirt-size', value: 'p' }];
    draft.answersByKey[subscriptionFormKey(submittedForm)] = [{ elementId: 'meal', value: 'no' }];

    expect(toSubscriptionFormAnswers([requiredForm, submittedForm], draft)).toEqual([
      {
        formId: 'form-shirt',
        linkId: 'link-shirt',
        targetType: 'MAJOR_EVENT',
        targetId: 'major-1',
        answers: [{ elementId: 'shirt-size', value: 'p' }],
      },
    ]);
  });

  it('serializes event and major-event answers through one shared mutation contract', () => {
    expect(
      toSubmitSubscriptionFormResponses([
        {
          formId: 'form-shirt',
          linkId: 'link-shirt',
          targetType: 'MAJOR_EVENT',
          targetId: 'major-1',
          answers: [{ elementId: 'shirt-size', value: 'p' }],
        },
        {
          formId: 'form-meal',
          linkId: 'link-meal',
          targetType: 'EVENT',
          targetId: 'event-1',
          answers: [{ elementId: 'meal', value: 'yes' }],
        },
      ]),
    ).toEqual([
      {
        formId: 'form-shirt',
        linkId: 'link-shirt',
        targetType: 'MAJOR_EVENT',
        majorEventId: 'major-1',
        answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'p' }]),
      },
      {
        formId: 'form-meal',
        linkId: 'link-meal',
        targetType: 'EVENT',
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'meal', value: 'yes' }]),
      },
    ]);
  });
});
