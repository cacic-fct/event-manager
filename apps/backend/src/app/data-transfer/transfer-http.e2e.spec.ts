import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Permission } from '@cacic-fct/shared-permissions';
import type {
  ResourceOfKind,
  TransferApplyRequest,
  TransferPreview,
  TransferResult,
} from '@cacic-fct/shared-data-transfer';
import axios, { type AxiosInstance } from 'axios';
import type { AddressInfo } from 'node:net';
import { KeycloakScopeGuard } from '../auth/guards/keycloak-scope.guard';
import type { KeycloakAuthService } from '../auth/keycloak-auth.service';
import type { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { DataTransferController } from './data-transfer.controller';
import { DataTransferService } from './data-transfer.service';
import { createTicketTransferFixture } from './testing/ticket-transfer.fixtures';

// Runs a disposable HTTP application, never the background backend. Only identity,
// authorization decisions and notification delivery are controlled test boundaries.
describe('preview, apply, replay and undo through authenticated HTTP and transactional storage', () => {
  let fixture: Awaited<ReturnType<typeof createTicketTransferFixture>>;
  let app: INestApplication | undefined;
  let http: AxiosInstance;

  beforeEach(async () => {
    fixture = await createTicketTransferFixture();
    const module = await Test.createTestingModule({
      controllers: [DataTransferController],
      providers: [{ provide: DataTransferService, useValue: fixture.transfer }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    const authentication = {
      authenticateAccessToken: async (token: string) => {
        if (token === 'organizer') return fixture.actor;
        if (token === 'other-organizer') return { ...fixture.actor, sub: 'organizer-2' };
        throw new UnauthorizedException();
      },
    };
    app.useGlobalGuards(
      new KeycloakScopeGuard(
        new Reflector(),
        authentication as unknown as KeycloakAuthService,
        fixture.authorization as unknown as AuthorizationPolicyService,
      ),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    http = axios.create({
      baseURL: `http://127.0.0.1:${address.port}/api/admin/data-transfer`,
      headers: { Authorization: 'Bearer organizer' },
      validateStatus: () => true,
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    await fixture.database.close();
  });

  async function review(): Promise<TransferApplyRequest> {
    const response = await http.post<TransferPreview>('/preview', { document: fixture.document });
    expect(response.status).toBe(201);
    expect(response.data).toMatchObject({ canApply: true, summary: { create: 1, skip: 0 } });
    return {
      document: fixture.document,
      planHash: response.data.planHash,
      allocationToken: response.data.allocation?.token,
      allowPartial: false,
    };
  }

  it('reviews without writes, applies once, recovers a lost response and atomically undoes the batch', async () => {
    const initial = await fixture.state();
    const request = await review();
    expect(await fixture.state()).toEqual(initial);
    const applied = await http.post<TransferResult>('/apply', request);
    expect(applied.status).toBe(201);
    expect(applied.data).toMatchObject({ applied: true, summary: { create: 1 } });
    expect(await fixture.client.eventTicket.findMany()).toHaveLength(1);
    const committed = await fixture.state();

    const retried = await http.post<TransferResult>('/apply', request);
    expect(retried.status).toBe(201);
    expect(retried.data.batchId).toBe(applied.data.batchId);
    expect(await fixture.state()).toEqual(committed);

    const history = await http.get('/history');
    expect(history.status).toBe(200);
    expect(history.data).toEqual([expect.objectContaining({ batchId: applied.data.batchId, undone: false })]);
    expect(JSON.stringify(history.data)).not.toContain('mutations');
    expect(JSON.stringify(history.data)).not.toContain('requestFingerprint');

    const undone = await http.post('/undo', { batchId: applied.data.batchId });
    expect(undone.status).toBe(201);
    expect(await fixture.client.eventTicket.findMany()).toEqual([]);
    expect(await fixture.client.eventTicketHistory.findMany()).toEqual([]);
    expect(await fixture.client.people.findMany()).toHaveLength(2);
    expect(await fixture.client.event.findMany()).toHaveLength(1);
    const afterUndo = await fixture.state();
    expect((await http.post('/apply', request)).status).toBe(409);
    expect((await http.post('/undo', { batchId: applied.data.batchId })).status).toBe(409);
    expect(await fixture.state()).toEqual(afterUndo);
  });

  it.each(['missing', 'invalid'] as const)('rejects %s credentials before a destructive apply', async (credential) => {
    const request = await review();
    const before = await fixture.state();
    const response = await http.post('/apply', request, {
      headers: { Authorization: credential === 'missing' ? '' : 'Bearer invalid' },
    });
    expect(response.status).toBe(401);
    expect(await fixture.state()).toEqual(before);
  });

  it('rechecks import permission after preview instead of trusting the reviewed hash', async () => {
    const request = await review();
    fixture.denied.add(Permission.DataTransfer.Import);
    const before = await fixture.state();
    expect((await http.post('/apply', request)).status).toBe(403);
    expect(await fixture.state()).toEqual(before);
  });

  it('rejects a stale preview after ticket configuration is disabled', async () => {
    const request = await review();
    await fixture.client.ticketConfig.update({ where: { id: 'config-1' }, data: { enabled: false } });
    const before = await fixture.state();
    expect((await http.post('/apply', request)).status).toBe(409);
    expect(await fixture.state()).toEqual(before);
  });

  it('rolls back a failed HTTP apply and permits a safe retry of the same reviewed request', async () => {
    const request = await review();
    fixture.realtime.enqueueForUsers.mockRejectedValueOnce(new Error('Notification storage unavailable'));
    const before = await fixture.state();
    expect((await http.post('/apply', request)).status).toBe(500);
    expect(await fixture.state()).toEqual(before);
    const retried = await http.post('/apply', request);
    expect(retried.status).toBe(201);
    expect(await fixture.client.eventTicket.findMany()).toHaveLength(1);
    expect(await fixture.client.eventTicketHistory.findMany()).toHaveLength(1);
  });

  it('hides another organizer’s history and rejects their attempt to undo a known batch ID', async () => {
    const applied = await http.post<TransferResult>('/apply', await review());
    expect(applied.status).toBe(201);
    const before = await fixture.state();
    const options = { headers: { Authorization: 'Bearer other-organizer' } };
    const history = await http.get('/history', options);
    expect(history.status).toBe(200);
    expect(history.data).toEqual([]);
    expect((await http.post('/undo', { batchId: applied.data.batchId }, options)).status).toBe(404);
    expect(await fixture.state()).toEqual(before);
  });

  it('returns a conflict and preserves a later consumption when undo is no longer safe', async () => {
    const applied = await http.post<TransferResult>('/apply', await review());
    expect(applied.status).toBe(201);
    const ticket = (await fixture.client.eventTicket.findMany())[0];
    await fixture.client.eventTicket.update({
      where: { id: ticket['id'] },
      data: {
        status: 'CONSUMED',
        consumedAt: new Date(),
      },
    });
    const before = await fixture.state();
    expect((await http.post('/undo', { batchId: applied.data.batchId })).status).toBe(409);
    expect(await fixture.state()).toEqual(before);
  });

  it('rejects identity-field injection in person decisions before planning or writing', async () => {
    const request = await review();
    const before = await fixture.state();
    const response = await http.post('/apply', {
      ...request,
      personDecisions: [
        {
          key: 'a'.repeat(64),
          action: 'create',
          data: { name: 'Ana Silva', userId: 'injected-account' },
        },
      ],
    });
    expect(response.status).toBe(400);
    expect(await fixture.state()).toEqual(before);
  });

  it('requires explicit person creation even with partial approval and binds the decision to a new review', async () => {
    const resource = fixture.document.resources[0] as ResourceOfKind<'event-ticket'>;
    const person = { name: 'Carla Souza', email: 'carla@example.test' };
    fixture.document = {
      ...fixture.document,
      resources: [
        {
          ...resource,
          data: { ...resource.data, person },
        },
      ],
    };
    const pending = await http.post<TransferPreview>('/preview', { document: fixture.document });
    expect(pending.status).toBe(201);
    expect(pending.data.canApply).toBe(false);
    const prompt = pending.data.personPrompts?.[0];
    if (!prompt) throw new Error('Expected a person creation prompt.');
    const before = await fixture.state();
    const people = await fixture.client.people.findMany();
    const request = {
      document: fixture.document,
      planHash: pending.data.planHash,
      allocationToken: pending.data.allocation?.token,
      allowPartial: true,
    };
    expect((await http.post('/apply', request)).status).toBe(409);
    expect(await fixture.state()).toEqual(before);
    expect(await fixture.client.people.findMany()).toEqual(people);

    const personDecisions = [{ key: prompt.key, action: 'create', data: person }];
    expect((await http.post('/apply', { ...request, personDecisions })).status).toBe(409);
    const reviewed = await http.post<TransferPreview>('/preview', { document: fixture.document, personDecisions });
    expect(reviewed.status).toBe(201);
    expect(reviewed.data.canApply).toBe(true);
    const applied = await http.post<TransferResult>('/apply', {
      ...request,
      personDecisions,
      planHash: reviewed.data.planHash,
      allocationToken: reviewed.data.allocation?.token,
    });
    expect(applied.status).toBe(201);
    expect(await fixture.client.people.findMany()).toHaveLength(3);
    const undo = await http.post('/undo', { batchId: applied.data.batchId });
    expect(undo.status).toBe(201);
    expect(await fixture.client.people.findMany()).toEqual(people);
    expect(await fixture.client.eventTicket.findMany()).toEqual([]);
  });

  it('requires partial approval to be explicit and applies only the executable ticket rows', async () => {
    const resource = fixture.document.resources[0] as ResourceOfKind<'event-ticket'>;
    fixture.document = {
      ...fixture.document,
      resources: [
        resource,
        {
          ...resource,
          key: 'BLOCKED-TICKET',
          data: {
            ...resource.data,
            person: { id: 'person-2' },
            originalHolderPersonId: 'person-2',
            status: 'CONSUMED',
            consumedAt: null,
          },
        },
      ],
    };
    const preview = await http.post<TransferPreview>('/preview', { document: fixture.document });
    expect(preview.status).toBe(201);
    expect(preview.data.summary).toMatchObject({ create: 1, skip: 1 });
    const request = {
      document: fixture.document,
      planHash: preview.data.planHash,
      allocationToken: preview.data.allocation?.token,
      allowPartial: false,
    };
    const before = await fixture.state();
    expect((await http.post('/apply', request)).status).toBe(409);
    expect(await fixture.state()).toEqual(before);
    const approved = await http.post<TransferResult>('/apply', { ...request, allowPartial: true });
    expect(approved.status).toBe(201);
    expect(approved.data.summary).toMatchObject({ create: 1, skip: 1 });
    expect(await fixture.client.eventTicket.findMany()).toEqual([
      expect.objectContaining({ holderPersonId: 'person-1', status: 'ACTIVE' }),
    ]);
    expect(await fixture.client.eventTicketHistory.findMany()).toHaveLength(1);
  });
});
