import {
  createAdminCertificateConfigFromInput,
  createAdminCertificateTemplate,
  createAdminEventFromInput,
  createAdminMajorEvent,
  createAdminMajorEventFromInput,
  createAdminOfflineEventAttendanceSubmission,
  createAdminPerson,
  createAdminWorkspaceDashboardInsights,
  createAdminWorkspaceEventSubscription,
  createAdminWorkspaceMajorEventSubscription,
} from './admin-entity-fixtures';

describe('admin entity fixtures', () => {
  it('maps major-event input payment data into the editable fixture shape', () => {
    const majorEvent = createAdminMajorEventFromInput({
      id: 'major-custom',
      name: 'Grande evento pago',
      isPaymentRequired: true,
      paymentInfo: {
        bankName: 'Banco Teste',
        agency: '0001',
        account: '12345-6',
        holder: 'CACiC',
        document: '12.345.678/0001-90',
        pixKey: 'pix@cacic.dev.br',
        pixCity: 'PRESIDENTE PRUDENTE',
      },
      price: {
        type: 'TIERED',
        tiers: [
          { name: 'Estudante', value: 2500 },
          { id: 'tier-community', name: 'Comunidade externa', value: 5000 },
        ],
      },
    });

    expect(majorEvent).toEqual(
      expect.objectContaining({
        id: 'major-custom',
        name: 'Grande evento pago',
        isPaymentRequired: true,
        publicationState: 'DRAFT',
        paymentInfo: expect.objectContaining({ id: 'major-custom-payment' }),
      }),
    );
    expect(majorEvent.majorEventPrices).toEqual([
      expect.objectContaining({
        id: 'major-custom-price',
        tiers: [
          expect.objectContaining({ id: 'major-custom-price-tier-1', value: 2500 }),
          expect.objectContaining({ id: 'tier-community', value: 5000 }),
        ],
      }),
    ]);
  });

  it('preserves explicit falsey event input values', () => {
    const event = createAdminEventFromInput({
      id: 'event-custom',
      name: 'Evento privado',
      creditMinutes: 0,
      allowSubscription: false,
      shouldIssueCertificate: false,
      shouldCollectAttendance: false,
      publiclyVisible: false,
      slots: null,
    });

    expect(event).toEqual(
      expect.objectContaining({
        id: 'event-custom',
        name: 'Evento privado',
        creditMinutes: 0,
        allowSubscription: false,
        shouldIssueCertificate: false,
        shouldCollectAttendance: false,
        publiclyVisible: false,
        slots: null,
      }),
    );
  });

  it('creates event subscriptions with coherent person and event relationships', () => {
    const person = createAdminPerson({ id: 'person-custom', email: 'pessoa@example.edu' });
    const subscription = createAdminWorkspaceEventSubscription({}, person);

    expect(subscription.personId).toBe('person-custom');
    expect(subscription.event).toEqual(expect.objectContaining({ id: subscription.eventId }));
    expect(subscription.person).toEqual(expect.objectContaining({ email: 'pessoa@example.edu' }));
  });

  it('creates major-event subscriptions with child event selection fixtures', () => {
    const majorEvent = createAdminMajorEvent({ id: 'major-subscription' });
    const subscription = createAdminWorkspaceMajorEventSubscription({}, createAdminPerson(), majorEvent);

    expect(subscription.majorEventId).toBe('major-subscription');
    expect(subscription.subscriptionStatus).toBe('CONFIRMED');
    expect(subscription.events).toEqual([
      expect.objectContaining({
        eventId: 'event-1',
        subscribed: true,
      }),
    ]);
  });

  it('builds offline attendance submissions for pending and resolved review states', () => {
    const pending = createAdminOfflineEventAttendanceSubmission();
    const rejected = createAdminOfflineEventAttendanceSubmission({
      status: 'REJECTED',
      rejectedById: 'admin-2',
      rejectedByFullName: 'Admin Dois',
      rejectionReason: 'Documento divergente',
    });

    expect(pending).toEqual(expect.objectContaining({ status: 'PENDING', committedAt: null, rejectedAt: null }));
    expect(rejected).toEqual(
      expect.objectContaining({
        status: 'REJECTED',
        rejectedById: 'admin-2',
        rejectionReason: 'Documento divergente',
      }),
    );
  });

  it('maps certificate config input through template defaults and override fields', () => {
    const template = createAdminCertificateTemplate({ id: 'template-custom', name: 'Modelo CACiC' });
    const config = createAdminCertificateConfigFromInput(
      {
        name: 'Certificado final',
        scope: 'MAJOR_EVENT',
        majorEventId: 'major-1',
        certificateTemplateId: template.id,
        shouldAutofillSecondPage: false,
        secondPageText: 'Texto complementar',
      },
      template,
      {
        id: 'config-custom',
      },
    );

    expect(config).toEqual(
      expect.objectContaining({
        id: 'config-custom',
        name: 'Certificado final',
        scope: 'MAJOR_EVENT',
        majorEventId: 'major-1',
        certificateTemplateId: 'template-custom',
        certificateTemplate: expect.objectContaining({ name: 'Modelo CACiC' }),
        shouldAutofillSecondPage: false,
        secondPageText: 'Texto complementar',
      }),
    );
  });

  it('allows dashboard insight edge counts to be overridden without losing collections', () => {
    const insights = createAdminWorkspaceDashboardInsights({
      pendingReceiptValidationsCount: 0,
      duplicatePeopleCount: 0,
    });

    expect(insights.pendingReceiptValidationsCount).toBe(0);
    expect(insights.duplicatePeopleCount).toBe(0);
    expect(insights.suggestions.length).toBeGreaterThan(0);
    expect(insights.calendarEvents.length).toBeGreaterThan(0);
  });
});
