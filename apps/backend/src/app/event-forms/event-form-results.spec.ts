import { type FormElement } from '@cacic-fct/form-contracts';
import {
  buildFormResultSummary,
  eventFormResultsToCsv,
} from './event-form-results';
import { eventFormModel, responseRecord } from './event-form.spec-support';

describe('event form results helpers', () => {
  it('builds result summaries and CSV exports with formula neutralization', () => {
    const elements: FormElement[] = [
      {
        id: 'track',
        type: 'singleChoice',
        title: 'Trilha',
        required: false,
        options: [
          { id: 'angular', label: 'Angular' },
          { id: 'nestjs', label: 'NestJS' },
        ],
      } as FormElement,
      {
        id: 'feedback',
        type: 'longText',
        title: 'Feedback',
        required: false,
        options: [],
      } as FormElement,
    ];
    const validResponses = [
      responseRecord({
        id: 'response-1',
        answers: [
          { elementId: 'track', value: 'angular' },
          { elementId: 'feedback', value: '=IMPORTXML("https://example.com")' },
        ],
      }),
      responseRecord({
        id: 'response-2',
        answers: [
          { elementId: 'track', value: 'nestjs' },
          { elementId: 'feedback', value: 'Gostei' },
        ],
      }),
    ];
    const responses = [
      ...validResponses,
      responseRecord({
        id: 'response-invalid',
        answers: { elementId: 'track', value: 'angular' } as never,
      }),
    ];

    const summary = buildFormResultSummary(elements, responses as never, true);

    expect(summary).toEqual({
      questions: [
        expect.objectContaining({
          elementId: 'track',
          answeredCount: 2,
          buckets: [
            { label: 'Angular', value: 1 },
            { label: 'NestJS', value: 1 },
          ],
          textAnswers: [],
        }),
        expect.objectContaining({
          elementId: 'feedback',
          answeredCount: 2,
          buckets: [],
          textAnswers: ['=IMPORTXML("https://example.com")', 'Gostei'],
        }),
      ],
    });
    expect(summary.questions).toHaveLength(2);

    const csv = eventFormResultsToCsv({
      form: eventFormModel({ elementsJson: JSON.stringify(elements) }),
      responses: validResponses.map((response) => ({
        id: response.id,
        respondentName: response.person.name,
        respondentEmail: response.person.email,
        submittedAt: response.submittedAt,
        answersJson: JSON.stringify(response.answers),
      })),
      summary: { questions: [] },
    } as never);

    expect(csv).toContain('"Angular"');
    expect(csv).toContain('"NestJS"');
    expect(csv).toContain('"\'=IMPORTXML(""https://example.com"")"');
  });
});
