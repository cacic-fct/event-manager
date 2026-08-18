import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicEventForm, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { PublicEventFormApiService } from './event-form-api.service';

describe('PublicEventFormApiService uncovered GraphQL operations', () => {
  let service: PublicEventFormApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PublicEventFormApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists current-user forms with the complete target scope and preserves the input variables', async () => {
    const input = {
      targetType: 'EVENT' as const,
      eventId: 'event-1',
      majorEventId: null,
      subscriptionFlowOnly: true,
    };
    const result = firstValueFrom(service.listCurrentUserForms(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserEventForms');
    expect(request.request.body.variables).toEqual(input);

    const forms = [createPublicEventForm({ id: 'form-1', name: 'Questionário' })];
    request.flush({ data: { currentUserEventForms: forms } });

    await expect(result).resolves.toEqual(forms);
    expect(input).toEqual({
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
      subscriptionFlowOnly: true,
    });
  });

  it('lists required subscription-form interruptions without variables', async () => {
    const result = firstValueFrom(service.listRequiredSubscriptionFormInterruptions());
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserRequiredSubscriptionFormInterruptions');
    expect(request.request.body.variables).toBeUndefined();

    const interruptions = [
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: 'EVENT',
        eventId: 'event-1',
        majorEventId: null,
        displayOrder: 1,
      },
    ];
    request.flush({ data: { currentUserRequiredSubscriptionFormInterruptions: interruptions } });

    await expect(result).resolves.toEqual(interruptions);
  });

  it('returns a nullable current-user response with all scope variables', async () => {
    const input = {
      formId: 'form-1',
      linkId: 'link-1',
      targetType: 'MAJOR_EVENT' as const,
      eventId: null,
      majorEventId: 'major-1',
    };
    const result = firstValueFrom(service.getCurrentUserResponse(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserEventFormResponse');
    expect(request.request.body.variables).toEqual(input);
    request.flush({ data: { currentUserEventFormResponse: null } });

    await expect(result).resolves.toBeNull();
  });

  it('loads current-user results with form, response, and target scope mapping', async () => {
    const input = {
      formId: 'form-1',
      targetType: 'EVENT' as const,
      eventId: 'event-1',
      majorEventId: null,
    };
    const result = firstValueFrom(service.getCurrentUserResults(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserEventFormResults');
    expect(request.request.body.query).toContain('answersReleased');
    expect(request.request.body.query).toContain('responses');
    expect(request.request.body.variables).toEqual(input);

    const submittedAt = publicFixtureDateFromNow(0, 12);
    const results = {
      responseCount: 1,
      anonymous: false,
      answersReleased: true,
      summaryJson: JSON.stringify({ favorite: { M: 1 } }),
      form: createPublicEventForm({ id: 'form-1', name: 'Questionário' }),
      responses: [
        {
          id: 'response-1',
          formId: 'form-1',
          linkId: null,
          targetType: 'EVENT',
          eventId: 'event-1',
          majorEventId: null,
          personId: 'person-1',
          respondentName: 'Pessoa',
          respondentEmail: null,
          answersJson: JSON.stringify([{ elementId: 'favorite', value: 'M' }]),
          source: 'PUBLIC',
          submittedAt,
          updatedAt: submittedAt,
        },
      ],
    };
    request.flush({ data: { currentUserEventFormResults: results } });

    await expect(result).resolves.toEqual(results);
  });

  it('submits a form response as an immutable input envelope', async () => {
    const input = {
      formId: 'form-1',
      linkId: null,
      targetType: 'EVENT' as const,
      eventId: 'event-1',
      majorEventId: null,
      answersJson: JSON.stringify([{ elementId: 'consent', value: true }]),
    };
    const result = firstValueFrom(service.submit(input));
    const request = http.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation SubmitCurrentUserEventFormResponse');
    expect(request.request.body.variables).toEqual({ input });

    const submittedAt = publicFixtureDateFromNow(0, 12);
    const response = {
      id: 'response-1',
      formId: 'form-1',
      linkId: null,
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
      personId: 'person-1',
      respondentName: 'Pessoa',
      respondentEmail: null,
      answersJson: input.answersJson,
      source: 'PUBLIC',
      submittedAt,
      updatedAt: submittedAt,
    };
    request.flush({ data: { submitCurrentUserEventFormResponse: response } });

    await expect(result).resolves.toEqual(response);
    expect(input.answersJson).toContain('consent');
  });

  it('surfaces GraphQL errors from form results', async () => {
    const result = firstValueFrom(
      service.getCurrentUserResults({ formId: 'form-1', targetType: 'EVENT', eventId: 'event-1' }),
    );
    http.expectOne('/api/graphql').flush({ errors: [{ message: 'Formulário indisponível' }, { message: 'Acesso negado' }] });

    await expect(result).rejects.toThrow('Formulário indisponível\nAcesso negado');
  });

  it('rejects a form response that has no GraphQL data', async () => {
    const result = firstValueFrom(
      service.getCurrentUserResponse({ formId: 'form-1', targetType: 'EVENT', eventId: 'event-1' }),
    );
    http.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});
