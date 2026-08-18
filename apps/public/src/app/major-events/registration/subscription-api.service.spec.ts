import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicMajorEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import type {
  PublicMajorEvent,
  SubmitPublicEventFormResponseInput,
} from '@cacic-fct/event-manager-public-contracts';
import { firstValueFrom } from 'rxjs';
import { MajorEventSubscriptionApiService } from './subscription-api.service';

describe('MajorEventSubscriptionApiService', () => {
  let httpTesting: HttpTestingController;
  let service: MajorEventSubscriptionApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(MajorEventSubscriptionApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads major events with the optional relative start date and maps the collection', async () => {
    const events = [majorEventFixture('major-1')];
    const startDateFrom = publicFixtureDateFromNow();
    const result = firstValueFrom(service.listMajorEvents(startDateFrom));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query PublicMajorEvents');
    expect(request.request.body.query).toContain('regularSubscriptionOpen');
    expect(request.request.body.query).toContain('registrationOpen');
    expect(request.request.body.variables).toEqual({ startDateFrom });
    request.flush({ data: { publicMajorEvents: events } });

    await expect(result).resolves.toEqual(events);
  });

  it('loads a major-event publication preview and rejects an empty preview', async () => {
    const event = majorEventFixture('preview-major');
    const expiresAt = publicFixtureDateFromNow(0, 1);
    const result = firstValueFrom(service.getPreviewMajorEvents('preview-token'));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query PublicationPreviewMajorEvent');
    expect(request.request.body.query).toContain('regularSubscriptionOpen');
    expect(request.request.body.query).toContain('registrationOpen');
    expect(request.request.body.variables).toEqual({ previewToken: 'preview-token' });
    request.flush({
      data: {
        publicationPreview: {
          expiresAt,
          majorEvent: event,
        },
      },
    });

    await expect(result).resolves.toEqual({
      events: [event],
      expiresAt,
    });

    const missingResult = firstValueFrom(service.getPreviewMajorEvents('missing-token'));
    httpTesting.expectOne('/api/graphql').flush({
      data: {
        publicationPreview: {
          expiresAt,
          majorEvent: null,
        },
      },
    });

    await expect(missingResult).rejects.toThrow('Pré-visualização sem grande evento.');
  });

  it('loads a group publication preview and rejects a preview without a group', async () => {
    const previewAt = publicFixtureDateFromNow();
    const expiresAt = publicFixtureDateFromNow(0, 1);
    const preview = {
      previewAt,
      expiresAt,
      eventGroup: {
        id: 'group-1',
        name: 'Grupo de eventos',
        emoji: '🎓',
        shouldIssueCertificate: true,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: true,
      },
      events: [],
    };
    const result = firstValueFrom(service.getPreviewGroup('preview-group'));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query PublicationPreviewGroup');
    expect(request.request.body.variables).toEqual({ previewToken: 'preview-group' });
    request.flush({ data: { publicationPreview: preview } });

    await expect(result).resolves.toEqual(preview);

    const missingResult = firstValueFrom(service.getPreviewGroup('missing-group'));
    httpTesting.expectOne('/api/graphql').flush({
      data: {
        publicationPreview: {
          previewAt,
          expiresAt,
          eventGroup: null,
          events: [],
        },
      },
    });

    await expect(missingResult).rejects.toThrow('Pré-visualização sem grupo de eventos.');
  });

  it('loads current-user major-event subscriptions and preserves null subscriptions', async () => {
    const subscriptions = [subscriptionFixture('subscription-1')];
    const listResult = firstValueFrom(service.listCurrentUserSubscriptions());
    const listRequest = httpTesting.expectOne('/api/graphql');

    expect(listRequest.request.body.query).toContain('query CurrentUserMajorEventSubscriptions');
    listRequest.flush({ data: { currentUserMajorEventSubscriptions: subscriptions } });
    await expect(listResult).resolves.toEqual(subscriptions);

    const currentResult = firstValueFrom(service.getCurrentUserSubscription('major-2'));
    const currentRequest = httpTesting.expectOne('/api/graphql');

    expect(currentRequest.request.body.query).toContain('query CurrentUserMajorEventSubscription');
    expect(currentRequest.request.body.variables).toEqual({ majorEventId: 'major-2' });
    currentRequest.flush({ data: { currentUserMajorEventSubscription: null } });

    await expect(currentResult).resolves.toBeNull();
  });

  it('loads the complete subscription page for a major event', async () => {
    const page = { majorEvent: majorEventFixture('major-page'), events: [] };
    const result = firstValueFrom(service.getSubscriptionPage('major-page'));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query PublicMajorEventSubscriptionPage');
    expect(request.request.body.variables).toEqual({ majorEventId: 'major-page' });
    request.flush({ data: { publicMajorEventSubscriptionPage: page } });

    await expect(result).resolves.toEqual(page);
  });

  it('sends standard subscription selections, tier, responses, and image agreement', async () => {
    const responses: SubmitPublicEventFormResponseInput[] = [
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: 'MAJOR_EVENT',
        majorEventId: 'major-1',
        answersJson: JSON.stringify([{ elementId: 'diet', value: 'vegetarian' }]),
      },
    ];
    const result = firstValueFrom(service.upsertSubscription('major-1', ['event-1', 'event-2'], 'student', responses, true));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation UpsertCurrentUserMajorEventSubscription');
    expect(request.request.body.variables).toEqual({
      majorEventId: 'major-1',
      selectedEventIds: ['event-1', 'event-2'],
      paymentTier: 'student',
      formResponses: responses,
      imageLicenseAgreementAccepted: true,
    });
    request.flush({ data: { upsertCurrentUserMajorEventSubscription: subscriptionFixture('subscription-1') } });

    await expect(result).resolves.toEqual(subscriptionFixture('subscription-1'));
  });

  it('sends ranked desired counts and omits an unspecified image-agreement variable', async () => {
    const result = firstValueFrom(
      service.upsertRankedSubscription(
        'major-ranked',
        ['event-1'],
        { desiredCourses: 2, desiredLectures: 1, desiredUncategorized: null },
        null,
        undefined,
        undefined,
      ),
    );
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation UpsertCurrentUserRankedMajorEventSubscription');
    expect(request.request.body.variables).toEqual({
      majorEventId: 'major-ranked',
      selectedEventIds: ['event-1'],
      desiredCourses: 2,
      desiredLectures: 1,
      desiredUncategorized: null,
      paymentTier: null,
      formResponses: undefined,
    });
    request.flush({ data: { upsertCurrentUserMajorEventSubscription: subscriptionFixture('subscription-ranked') } });

    await expect(result).resolves.toEqual(subscriptionFixture('subscription-ranked'));
  });

  it('maps GraphQL errors from every shared query/mutation boundary', async () => {
    const result = firstValueFrom(service.getCurrentUserSubscription('major-error'));
    httpTesting.expectOne('/api/graphql').flush({
      errors: [{ message: 'Inscrição não encontrada.' }, { message: 'Tente novamente.' }],
    });

    await expect(result).rejects.toThrow('Inscrição não encontrada.\nTente novamente.');
  });

  it('rejects GraphQL responses without data', async () => {
    const result = firstValueFrom(service.listMajorEvents());
    httpTesting.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});

function majorEventFixture(id: string): PublicMajorEvent {
  return createPublicMajorEvent({ id, name: `Grande evento ${id}` });
}

function subscriptionFixture(id: string): Record<string, unknown> {
  return {
    id,
    majorEventId: 'major-1',
    subscriptionStatus: 'PENDING',
    amountPaid: null,
    paymentDate: null,
    paymentTier: null,
    imageLicenseAgreementAccepted: false,
    selectedEvents: [],
    majorEvent: createPublicMajorEvent({ id: 'major-1', isPaymentRequired: false }),
  };
}
