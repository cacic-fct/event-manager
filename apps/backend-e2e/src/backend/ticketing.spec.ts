import { UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import {
  clearTicketingDatabaseFixture,
  createTicketingDatabaseFixture,
  AccountManagerGrpcClient,
  KeycloakAuthService,
  NovuNotificationsService,
  PrismaService,
  TicketIssuanceService,
  TicketTransferResolutionService,
} from '@cacic-fct/backend/ticketing-testing';
import type { M2MUserIdentifierLookupMatch } from '@cacic-fct/account-manager-m2m-contracts';
import type {
  AuthenticatedUser,
  TicketingDatabaseFixture,
} from '@cacic-fct/backend/ticketing-testing';
import { getBackendE2eApp } from '../support/test-setup';

const describeTicketingHttp = process.env['TICKETING_HTTP_E2E_TEST'] === '1' ? describe : describe.skip;

describeTicketingHttp('ticketing HTTP journey with PostgreSQL and a controlled auth boundary', () => {
  let fixture: TicketingDatabaseFixture | undefined;
  let prisma: PrismaService | undefined;

  beforeAll(async () => {
    const app = getBackendE2eApp();
    const database = app.get(PrismaService);
    prisma = database;
    fixture = await createTicketingDatabaseFixture(database);

    jest.spyOn(app.get(AccountManagerGrpcClient), 'lookupUsersByEmail').mockImplementation(async (email): Promise<M2MUserIdentifierLookupMatch[]> => {
      const account = await database.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { id: true, name: true, email: true },
      });
      return account ? [{
        requestId: 'event-manager-audience-email',
        userId: account.id,
        name: account.name,
        email: account.email,
        secondaryEmails: [],
      }] : [];
    });
    jest.spyOn(app.get(KeycloakAuthService), 'authenticateAccessToken').mockImplementation(async (token) => {
      const userId = token.startsWith('ticketing-e2e:') ? token.slice('ticketing-e2e:'.length) : '';
      const scenario = requireFixture();
      if (userId !== scenario.senderUserId && userId !== scenario.recipientUserId) {
        throw new UnauthorizedException();
      }
      return testPrincipal(userId, token);
    });
    jest.spyOn(app.get(NovuNotificationsService), 'notifyTicketTransfer').mockResolvedValue(false);
  });

  afterAll(async () => {
    if (fixture && prisma) await clearTicketingDatabaseFixture(prisma, fixture);
    jest.restoreAllMocks();
  });

  it('transfers and accepts a ticket, then reads its archived state over GraphQL HTTP', async () => {
    const scenario = requireFixture();
    const database = requirePrisma();
    const senderToken = `ticketing-e2e:${scenario.senderUserId}`;
    const recipientToken = `ticketing-e2e:${scenario.recipientUserId}`;
    const started = await graphQl<{ startTicketTransfer: TransferResponse }>(
      `mutation {
        startTicketTransfer(ticketId: "${scenario.ticketId}", destinationIdentityDocument: "${scenario.recipientDocument}") {
          id senderStatus recipientStatus submittedDestinationIdentityDocument
          recipient { personId }
          ticket { id aztecPayload }
        }
      }`,
      senderToken,
    );
    const transfer = started.startTicketTransfer;
    expect(transfer).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      submittedDestinationIdentityDocument: scenario.recipientDocument,
      recipient: null,
      ticket: expect.objectContaining({ id: scenario.ticketId, aztecPayload: null }),
    }));

    await resolveTransfer(scenario, database);

    const authorView = await graphQl<{ ticketTransfer: TransferResponse | null }>(
      `query { ticketTransfer(transferId: "${transfer.id}") {
        senderStatus recipientStatus submittedDestinationIdentityDocument recipient { personId }
      } }`,
      senderToken,
    );
    expect(authorView.ticketTransfer).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      submittedDestinationIdentityDocument: scenario.recipientDocument,
      recipient: null,
    }));

    const recipientView = await graphQl<{ ticketTransfer: TransferResponse | null }>(
      `query { ticketTransfer(transferId: "${transfer.id}") {
        senderStatus recipientStatus submittedDestinationIdentityDocument recipient { personId }
        ticket { id aztecPayload }
      } }`,
      recipientToken,
    );
    expect(recipientView.ticketTransfer).toEqual(expect.objectContaining({
      senderStatus: 'PENDING',
      recipientStatus: 'PENDING',
      submittedDestinationIdentityDocument: null,
      recipient: expect.objectContaining({ personId: scenario.recipientPersonId }),
      ticket: expect.objectContaining({ id: scenario.ticketId, aztecPayload: null }),
    }));

    const accepted = await graphQl<{ acceptTicketTransfer: TransferResponse }>(
      `mutation { acceptTicketTransfer(transferId: "${transfer.id}") {
        id senderStatus recipientStatus recipient { personId } ticket { holder { personId } aztecPayload }
      } }`,
      recipientToken,
    );
    expect(accepted.acceptTicketTransfer).toEqual(expect.objectContaining({
      senderStatus: 'ACCEPTED',
      recipientStatus: 'ACCEPTED',
      recipient: expect.objectContaining({ personId: scenario.recipientPersonId }),
      ticket: expect.objectContaining({
        holder: expect.objectContaining({ personId: scenario.recipientPersonId }),
        aztecPayload: null,
      }),
    }));

    const persisted = await database.eventTicket.findUniqueOrThrow({ where: { id: scenario.ticketId } });
    expect(persisted.holderPersonId).toBe(scenario.recipientPersonId);
    expect((await database.ticketTransfer.findUniqueOrThrow({ where: { id: transfer.id } }))
      .submittedDestinationIdentityDocumentEncrypted).toBeNull();

    const issuance = getBackendE2eApp().get(TicketIssuanceService);
    await database.$transaction((tx) => issuance.consumeForAttendance(tx, scenario.eventId, scenario.recipientPersonId));

    const archived = await graphQl<{ myWalletTicket: WalletResponse | null }>(
      `query { myWalletTicket(ticketId: "${scenario.ticketId}") { id status aztecPayload holder { personId } } }`,
      recipientToken,
    );
    expect(archived.myWalletTicket).toEqual(expect.objectContaining({
      id: scenario.ticketId,
      status: 'CONSUMED',
      aztecPayload: `ticket:${scenario.ticketId}:${scenario.recipientUserId}`,
      holder: expect.objectContaining({ personId: scenario.recipientPersonId }),
    }));
    expect(await database.eventTicketHistory.count({
      where: { transferId: transfer.id, operation: 'TRANSFERRED' },
    })).toBe(1);
  });

  it.each([
    ['ticket SSE stream', '/api/current-user/tickets/realtime/events'],
    ['protected ticket receipt', '/api/ticket-purchases/purchase-without-session/receipt'],
  ])('rejects an anonymous request to the %s', async (_label, path) => {
    const response = await axios.get(path, { validateStatus: () => true });
    expect([401, 403]).toContain(response.status);
  });

  function requireFixture(): TicketingDatabaseFixture {
    if (!fixture) throw new Error('Ticketing fixture was not created.');
    return fixture;
  }

  function requirePrisma(): PrismaService {
    if (!prisma) throw new Error('The backend E2E Prisma service is not available.');
    return prisma;
  }
});

type TransferResponse = {
  id: string;
  senderStatus: string;
  recipientStatus: string;
  submittedDestinationIdentityDocument: string | null;
  recipient: { personId: string } | null;
  ticket: {
    id?: string;
    aztecPayload: string | null;
    holder?: { personId: string } | null;
  };
};

type WalletResponse = {
  id: string;
  status: string;
  aztecPayload: string | null;
  holder: { personId: string } | null;
};

async function graphQl<T>(query: string, token: string): Promise<T> {
  const response = await axios.post('/api/graphql', { query }, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
  expect(response.status).toBe(200);
  const envelope = response.data as { data?: T; errors?: Array<{ message: string }> };
  expect(envelope.errors).toBeUndefined();
  if (!envelope.data) throw new Error('Expected the GraphQL response to include data.');
  return envelope.data;
}

async function resolveTransfer(fixture: TicketingDatabaseFixture, prisma: PrismaService): Promise<void> {
  const resolution = getBackendE2eApp().get(TicketTransferResolutionService);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await invokePrivate(resolution, 'processPending');
    const transfer = await prisma.ticketTransfer.findFirst({
      where: { ticketId: fixture.ticketId },
      select: { recipientUserId: true, recipientStatus: true },
    });
    if (transfer?.recipientUserId === fixture.recipientUserId && transfer.recipientStatus === 'PENDING') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('The ticket transfer recipient was not resolved within the HTTP E2E deadline.');
}

async function invokePrivate(service: object, name: 'processPending'): Promise<void> {
  const methods = service as unknown as Record<typeof name, () => Promise<void>>;
  await methods[name].call(service);
}

function testPrincipal(userId: string, token: string): AuthenticatedUser {
  const roles = ['access'];
  const scopes: string[] = [];
  const permissions: string[] = [];
  return {
    realm_access: { roles },
    sub: userId,
    email: `${userId}@example.test`,
    token,
    roles,
    roleSet: new Set(roles),
    permissions,
    permissionSet: new Set(permissions),
    oidcScopes: scopes,
    oidcScopeSet: new Set(scopes),
    scopes,
    scopeSet: new Set(scopes),
    claims: { is_onboarded: true },
  };
}
