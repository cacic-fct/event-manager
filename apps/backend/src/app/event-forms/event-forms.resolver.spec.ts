import { EventFormTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventFormsResolver } from './event-forms.resolver';

describe('EventFormsResolver', () => {
  const user = { sub: 'admin-1' };
  const reqContext = { req: { user } };
  const requestContext = { request: { user } };
  const forms = {
    listAdminForms: jest.fn(),
    getAdminForm: jest.fn(),
    getAdminResults: jest.fn(),
    listDrafts: jest.fn(),
    listCurrentUserForms: jest.fn(),
    listCurrentUserRequiredSubscriptionFormInterruptions: jest.fn(),
    countPreviousSubscribers: jest.fn(),
    getCurrentUserResponse: jest.fn(),
    getCurrentUserResults: jest.fn(),
    listLecturerForms: jest.fn(),
    getLecturerResults: jest.fn(),
    saveForm: jest.fn(),
    saveDraft: jest.fn(),
    publishForm: jest.fn(),
    publishLecturerForm: jest.fn(),
    unpublishForm: jest.fn(),
    deleteForm: jest.fn(),
    submitCurrentUserResponse: jest.fn(),
  };
  const resolver = new EventFormsResolver(forms as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('declares the admin permission and scoped-collection boundaries', () => {
    const permissions = {
      eventForms: Permission.EventForm.Read,
      eventForm: Permission.EventForm.Read,
      eventFormResults: Permission.EventForm.Results,
      eventFormDrafts: Permission.EventForm.Update,
      eventFormPreviousSubscriberCount: Permission.EventForm.Update,
      publishEventForm: Permission.EventForm.Publish,
      unpublishEventForm: Permission.EventForm.Publish,
      deleteEventForm: Permission.EventForm.Delete,
    } as const;

    for (const [method, permission] of Object.entries(permissions)) {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventFormsResolver.prototype[method as keyof EventFormsResolver]),
      ).toEqual([permission]);
    }
    expect(Reflect.getMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, EventFormsResolver.prototype.eventForms)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata(
        ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY,
        EventFormsResolver.prototype.eventFormPreviousSubscriberCount,
      ),
    ).toBe(true);
    expect(
      Reflect.getMetadata(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, EventFormsResolver.prototype.saveEventForm),
    ).toBe(true);
  });

  it('maps every administrator query to the authenticated actor and exact arguments', () => {
    resolver.eventForms(reqContext as never, 'pesquisa', 'event-1', 'major-1');
    resolver.eventForm('form-1', requestContext as never);
    resolver.eventFormResults('form-1', reqContext as never);
    resolver.eventFormDrafts('form-1', requestContext as never);
    const countInput = { targetType: EventFormTargetType.EVENT, eventId: 'event-1' };
    resolver.eventFormPreviousSubscriberCount(countInput as never, reqContext as never);

    expect(forms.listAdminForms).toHaveBeenCalledWith(user, {
      query: 'pesquisa',
      eventId: 'event-1',
      majorEventId: 'major-1',
    });
    expect(forms.getAdminForm).toHaveBeenCalledWith(user, 'form-1');
    expect(forms.getAdminResults).toHaveBeenCalledWith(user, 'form-1');
    expect(forms.listDrafts).toHaveBeenCalledWith('form-1', user);
    expect(forms.countPreviousSubscribers).toHaveBeenCalledWith(user, countInput);
  });

  it('maps every current-user and lecturer query without replacing its GraphQL context', () => {
    resolver.currentUserEventForms(
      reqContext as never,
      EventFormTargetType.EVENT,
      'event-1',
      undefined,
      true,
      'tier-1',
    );
    resolver.currentUserRequiredSubscriptionFormInterruptions(reqContext as never);
    resolver.currentUserEventFormResponse(
      reqContext as never,
      'form-1',
      EventFormTargetType.EVENT,
      'event-1',
      undefined,
      'link-1',
    );
    resolver.currentUserEventFormResults(
      reqContext as never,
      'form-1',
      EventFormTargetType.MAJOR_EVENT,
      undefined,
      'major-1',
    );
    resolver.lecturerEventForms(reqContext as never, 'event-1');
    resolver.lecturerEventFormResults(reqContext as never, 'form-1', 'event-1');

    expect(forms.listCurrentUserForms).toHaveBeenCalledWith(
      reqContext,
      { targetType: EventFormTargetType.EVENT, eventId: 'event-1', majorEventId: undefined },
      { subscriptionFlowOnly: true, selectedPriceTierId: 'tier-1' },
    );
    expect(forms.listCurrentUserRequiredSubscriptionFormInterruptions).toHaveBeenCalledWith(reqContext);
    expect(forms.getCurrentUserResponse).toHaveBeenCalledWith(reqContext, {
      formId: 'form-1',
      targetType: EventFormTargetType.EVENT,
      eventId: 'event-1',
      majorEventId: undefined,
      linkId: 'link-1',
    });
    expect(forms.getCurrentUserResults).toHaveBeenCalledWith(reqContext, {
      formId: 'form-1',
      targetType: EventFormTargetType.MAJOR_EVENT,
      eventId: undefined,
      majorEventId: 'major-1',
    });
    expect(forms.listLecturerForms).toHaveBeenCalledWith(reqContext, 'event-1');
    expect(forms.getLecturerResults).toHaveBeenCalledWith(reqContext, 'form-1', 'event-1');
  });

  it('maps every administrator mutation to its exact service operation and actor', () => {
    const formInput = { name: 'Avaliação' };
    const draftInput = { sourceFormId: 'form-1' };
    const scheduledPublishAt = publicFixtureDateFromNow(7);
    resolver.saveEventForm(formInput as never, reqContext as never);
    resolver.saveEventFormDraft(draftInput as never, requestContext as never);
    resolver.publishEventForm({ formId: 'form-1', scheduledPublishAt } as never, reqContext as never);
    resolver.unpublishEventForm('form-1', requestContext as never);
    resolver.deleteEventForm('form-1', reqContext as never);

    expect(forms.saveForm).toHaveBeenCalledWith(formInput, user);
    expect(forms.saveDraft).toHaveBeenCalledWith(draftInput, user);
    expect(forms.publishForm).toHaveBeenCalledWith('form-1', scheduledPublishAt, user);
    expect(forms.unpublishForm).toHaveBeenCalledWith('form-1', user);
    expect(forms.deleteForm).toHaveBeenCalledWith('form-1', user);
  });

  it('maps lecturer publication and current-user response submission with the original context', () => {
    const submission = { formId: 'form-1', answersJson: '[]' };

    resolver.publishLecturerEventForm(reqContext as never, 'form-1', 'event-1');
    resolver.submitCurrentUserEventFormResponse(reqContext as never, submission as never);

    expect(forms.publishLecturerForm).toHaveBeenCalledWith(reqContext, 'form-1', 'event-1');
    expect(forms.submitCurrentUserResponse).toHaveBeenCalledWith(reqContext, submission);
  });

  it('allows service-level anonymous handling when no request principal is attached', () => {
    resolver.eventForms({} as never);

    expect(forms.listAdminForms).toHaveBeenCalledWith(undefined, {
      query: undefined,
      eventId: undefined,
      majorEventId: undefined,
    });
  });
});
