import { EventFormSigilo, EventFormTargetType } from '@prisma/client';
import {
  canShowIdentity,
  canShowIndividualAnswers,
  toPublicEventFormModel,
  toResponseModel,
} from './event-form-model.mapper';
import { eventFormLinkModel, eventFormModel, responseRecord } from './event-form.spec-support';

describe('event form model mapper', () => {
  it('maps public form and response models without leaking unreleased counts or private identities', () => {
    const publicForm = toPublicEventFormModel(
      eventFormModel({
        resultsPublic: true,
        resultsLive: false,
        responseCount: 7,
        links: [
          eventFormLinkModel({ id: 'event-link', eventId: 'event-1', responseCount: 5 }),
          eventFormLinkModel({
            id: 'major-link',
            targetType: EventFormTargetType.MAJOR_EVENT,
            eventId: null,
            majorEventId: 'major-1',
            responseCount: 2,
          }),
        ],
      }),
      { targetType: EventFormTargetType.EVENT, eventId: 'event-1' },
    );

    expect(publicForm.responseCount).toBe(0);
    expect(publicForm.links).toEqual([
      expect.objectContaining({
        id: 'event-link',
        responseCount: 0,
      }),
    ]);
    expect(canShowIdentity(EventFormSigilo.ANONYMOUS, 'public')).toBe(false);
    expect(canShowIdentity(EventFormSigilo.ANONYMOUS, 'self')).toBe(true);
    expect(canShowIndividualAnswers(EventFormSigilo.PARTIALLY_SECRET, 'public')).toBe(false);
    expect(
      toResponseModel(
        responseRecord({
          answers: [{ elementId: 'feedback', value: 'Ótimo' }],
        }),
        EventFormSigilo.ANONYMOUS,
        'public',
      ),
    ).toEqual(
      expect.objectContaining({
        personId: null,
        respondentName: null,
        respondentEmail: null,
        submittedAt: null,
        answersJson: '[]',
      }),
    );
    expect(
      toResponseModel(
        responseRecord({
          answers: [{ elementId: 'feedback', value: 'Não deve vazar' }],
        }),
        EventFormSigilo.ANONYMOUS,
        'public',
        { includeAnswers: true },
      ).answersJson,
    ).toBe('[]');
  });

  it('releases public response counts while live or after the target link closes', () => {
    const liveForm = toPublicEventFormModel(
      eventFormModel({
        resultsPublic: true,
        resultsLive: true,
        responseCount: 7,
        links: [eventFormLinkModel({ id: 'event-link', eventId: 'event-1', responseCount: 5 })],
      }),
      { targetType: EventFormTargetType.EVENT, eventId: 'event-1' },
    );
    const closedForm = toPublicEventFormModel(
      eventFormModel({
        resultsPublic: true,
        resultsLive: false,
        responseCount: 7,
        links: [
          eventFormLinkModel({
            id: 'event-link',
            eventId: 'event-1',
            responseCount: 5,
            availableUntil: new Date('2026-06-01T12:00:00.000Z'),
          }),
        ],
      }),
      { targetType: EventFormTargetType.EVENT, eventId: 'event-1' },
    );

    expect(liveForm.responseCount).toBe(5);
    expect(liveForm.links[0].responseCount).toBe(5);
    expect(closedForm.responseCount).toBe(5);
    expect(closedForm.links[0].responseCount).toBe(5);
  });
});
