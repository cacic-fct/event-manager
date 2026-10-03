import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';
import type { TicketConfigInput } from '@cacic-fct/shared-ticketing';
import { GraphqlHttpService } from './graphql-http.service';
import { TicketAdminApiService } from './ticket-admin-api.service';
import { createAdminEventTicket, createAdminTicketConfig, createTicketEventSummary } from '@cacic-fct/shared-ticketing/testing';
import { adminFixtureDateFromNow } from '../testing/admin-entity-fixtures';

describe('TicketAdminApiService', () => {
  let graphql: { request: ReturnType<typeof vi.fn> };
  let service: TicketAdminApiService;

  beforeEach(() => {
    graphql = { request: vi.fn((query: string) => responseFor(query)) };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        TicketAdminApiService,
        { provide: GraphqlHttpService, useValue: graphql },
      ],
    });
    service = TestBed.inject(TicketAdminApiService);
  });

  it('requests ticket configurations within an event or major-event scope', async () => {
    await expect(firstValueFrom(service.getConfigs({ eventId: 'event-1' }))).resolves.toEqual([]);
    await expect(firstValueFrom(service.getConfigs({ majorEventId: 'major-1' }))).resolves.toEqual([]);
    expect(graphql.request).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('adminTicketConfigs(eventId: $eventId, majorEventId: $majorEventId)'),
      { eventId: 'event-1' },
    );
    expect(graphql.request).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('adminTicketConfigs(eventId: $eventId, majorEventId: $majorEventId)'),
      { majorEventId: 'major-1' },
    );
  });

  it('returns event-scoped config with recipient rules and tier prices intact', async () => {
    const event = createTicketEventSummary({ id: 'event-1', name: 'Jantar de integração' });
    const config = createAdminTicketConfig({
      eventId: event.id,
      event,
      majorEventId: 'major-1',
      recipientPolicy: {
        subscriptionRequirement: 'REQUIRED',
        requiresUnesp: true,
        requiredAcademicIdPrefixes: ['2024'],
        requiredCourseCodes: ['12'],
        requiresAccountManagerVerification: true,
        allowedPriceTierIds: ['tier-student'],
      },
      priceOptions: [{ id: 'price-student', priceTierId: 'tier-student', label: 'Estudante', amountCents: 8000 }],
      expirationMode: 'CUSTOM',
      customExpiresAt: adminFixtureDateFromNow(30),
    });
    graphql.request.mockReturnValueOnce(of({ adminTicketConfigs: [config] }));

    await expect(firstValueFrom(service.getConfigs({ eventId: event.id }))).resolves.toEqual([config]);
    const query = graphql.request.mock.calls[0]?.[0] as string;
    expect(query).toContain('requiredAcademicIdPrefixes');
    expect(query).toContain('allowedPriceTierIds');
    expect(query).toContain('priceOptions { id priceTierId label amountCents }');
    expect(query).toContain('customExpiresAt');
  });

  it('saves recipient, purchase visibility, and expiration rules together', async () => {
    const input: TicketConfigInput = {
      eventId: 'event-1',
      enabled: true,
      displayName: 'Jantar',
      displayEmoji: '🍽️',
      description: 'Acesso ao jantar.',
      transferEligibilityDescription: 'Somente estudantes.',
      transferable: true,
      issueOnEventSubscription: false,
      issueOnMajorEventSubscription: true,
      includedPriceTierIds: ['tier-1'],
      recipientPolicy: {
        subscriptionRequirement: 'REQUIRED',
        requiresUnesp: true,
        requiredAcademicIdPrefixes: ['2024'],
        requiredCourseCodes: ['12'],
        requiresAccountManagerVerification: true,
        allowedPriceTierIds: ['tier-1'],
      },
      purchaseEnabled: true,
      purchaseVisibility: {
        subscriptionRequirement: 'REQUIRED',
        requiresUnesp: true,
        requiredAcademicIdPrefixes: [],
        requiredCourseCodes: ['12'],
        requiresAccountManagerVerification: false,
        allowedPriceTierIds: ['tier-1'],
        requiresValidatedSubscription: true,
      },
      priceOptions: [{ id: 'price-1', priceTierId: 'tier-1', label: 'Estudante', amountCents: 8000 }],
      expirationMode: 'CUSTOM',
      customExpiresAt: adminFixtureDateFromNow(30),
    };

    await firstValueFrom(service.saveConfig(input));

    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation SaveTicketConfig($input: TicketConfigInput!)'),
      { input },
    );
    const query = graphql.request.mock.calls[0][0] as string;
    expect(query).toContain('requiredCourseCodes');
    expect(query).toContain('customExpiresAt');
  });

  it('uses server eligibility warnings before admin issue or transfer', async () => {
    await firstValueFrom(service.getEligibilityWarnings('event-1', 'person-1'));
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('adminTicketEligibilityWarnings(eventId: $eventId, personId: $personId)'),
      { eventId: 'event-1', personId: 'person-1' },
    );
  });

  it('uses bounded status and search filters for the holder list', async () => {
    await firstValueFrom(service.getEventTickets({
      eventId: 'event-1',
      status: 'ACTIVE',
      search: 'Ada',
      take: 50,
      cursor: 'cursor-1',
    }));
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('adminEventTickets('),
      { eventId: 'event-1', status: 'ACTIVE', search: 'Ada', take: 50, cursor: 'cursor-1' },
    );
  });

  it('maps holder rows with lifecycle, origin, and masked identity', async () => {
    const ticket = createAdminEventTicket({
      id: 'ticket-1',
      eventId: 'event-1',
      status: 'CONSUMED',
      source: 'MAJOR_EVENT_SUBSCRIPTION',
      sourceReference: 'Inscrição subscription-1. Lote: Estudante.',
    });
    const page = { tickets: [ticket], nextCursor: 'next-page', totalCount: 11 };
    graphql.request.mockReturnValueOnce(of({ adminEventTickets: page }));

    await expect(firstValueFrom(service.getEventTickets({ eventId: 'event-1', take: 50 }))).resolves.toEqual(page);
    const query = graphql.request.mock.calls[0]?.[0] as string;
    expect(query).toContain('redactedIdentityDocument');
    expect(query).toContain('sourceReference');
    expect(query).toContain('lastHistoryEntry');
  });

  it('sends audit reasons for manual issue, revocation, and admin transfer', async () => {
    await firstValueFrom(service.issueTicket({ eventId: 'event-1', personId: 'person-1', reason: 'Inclusão especial.' }));
    await firstValueFrom(service.revokeTicket({ ticketId: 'ticket-1', reason: 'Solicitação do participante.' }));
    await firstValueFrom(service.startTransfer({ ticketId: 'ticket-1', recipientPersonId: 'person-2', reason: 'Ajuste administrativo.' }));

    expect(graphql.request).toHaveBeenNthCalledWith(1, expect.stringContaining('adminIssueTicket(input: $input)'), {
      input: { eventId: 'event-1', personId: 'person-1', reason: 'Inclusão especial.' },
    });
    expect(graphql.request).toHaveBeenNthCalledWith(2, expect.stringContaining('adminRevokeTicket(input: $input)'), {
      input: { ticketId: 'ticket-1', reason: 'Solicitação do participante.' },
    });
    expect(graphql.request).toHaveBeenNthCalledWith(3, expect.stringContaining('adminStartTicketTransfer(input: $input)'), {
      input: { ticketId: 'ticket-1', recipientPersonId: 'person-2', reason: 'Ajuste administrativo.' },
    });
  });

  it('loads the auditable ticket trail by the immutable ticket identifier', async () => {
    await expect(firstValueFrom(service.getHistory('ticket-uuid'))).resolves.toEqual([]);
    expect(graphql.request).toHaveBeenCalledWith(
      expect.stringContaining('adminTicketHistory(ticketId: $ticketId)'),
      { ticketId: 'ticket-uuid' },
    );
    const query = graphql.request.mock.calls[0]?.[0] as string;
    expect(query).toContain('operation');
    expect(query).toContain('previousHolder');
    expect(query).toContain('newHolder');
    expect(query).toContain('actorName');
    expect(query).toContain('reason');
  });
});

function responseFor(query: string) {
  if (query.includes('AdminTicketConfigs')) return of({ adminTicketConfigs: [] });
  if (query.includes('AdminTicketEligibilityWarnings')) return of({ adminTicketEligibilityWarnings: { eligible: true, warnings: [] } });
  if (query.includes('AdminEventTickets')) return of({ adminEventTickets: { tickets: [], nextCursor: null, totalCount: 0 } });
  if (query.includes('AdminTicketHistory')) return of({ adminTicketHistory: [] });
  if (query.includes('SaveTicketConfig')) return of({ saveTicketConfig: {} });
  if (query.includes('AdminIssueTicket')) return of({ adminIssueTicket: {} });
  if (query.includes('AdminRevokeTicket')) return of({ adminRevokeTicket: {} });
  if (query.includes('AdminStartTicketTransfer')) return of({ adminStartTicketTransfer: {} });
  return of({});
}
