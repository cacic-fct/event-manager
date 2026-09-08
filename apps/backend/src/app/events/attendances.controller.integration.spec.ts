import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import axios from 'axios';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AddressInfo } from 'node:net';
import { AttendanceCategoryService } from './attendance-category.service';
import { EventAttendancesController } from './attendances.controller';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { PrismaService } from '../prisma/prisma.service';
import { SseReplayService } from '../realtime/sse-replay.service';

describe('EventAttendancesController HTTP lifecycle', () => {
  let app: INestApplication;
  let feed: jest.Mock;
  let authorize: jest.Mock;
  let auth: { authenticateAccessToken: jest.Mock; authenticateSession: jest.Mock };

  beforeAll(async () => {
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({ id: 'event-1', deletedAt: null }),
      },
    };
    auth = {
      authenticateAccessToken: jest.fn().mockResolvedValue({ sub: 'collector-user' }),
      authenticateSession: jest.fn().mockResolvedValue({ sub: 'collector-user' }),
    };
    authorize = jest.fn().mockResolvedValue(undefined);
    const replay = {
      scope: jest.fn(() => 'event-attendance-scanner-feed:test-scope'),
      replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [EventAttendancesController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AttendanceCategoryService, useValue: {} },
        { provide: KeycloakAuthService, useValue: auth },
        { provide: AuthorizationPolicyService, useValue: { assertPermissions: authorize } },
        { provide: SseReplayService, useValue: replay },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address() as AddressInfo;
    axios.defaults.baseURL = `http://127.0.0.1:${address.port}`;
    feed = jest.fn().mockResolvedValue([
      {
        personId: 'person-1',
        eventId: 'event-1',
        fullName: 'Participant',
      },
    ]);
    const controller = moduleRef.get(EventAttendancesController);
    (controller as unknown as { getScannerFeed: jest.Mock }).getScannerFeed = feed;
  });

  afterAll(async () => {
    axios.defaults.baseURL = undefined;
    await app?.close();
  });

  beforeEach(() => {
    feed.mockClear();
    authorize.mockReset().mockResolvedValue(undefined);
    auth.authenticateAccessToken.mockClear();
    auth.authenticateSession.mockClear();
  });

  it('serializes an authenticated SSE snapshot and stops polling after the HTTP client disconnects', async () => {
    const response = await axios.get('/event-attendances/events/event-1/scanner-feed/events', {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-1` },
      responseType: 'stream',
      timeout: 5_000,
    });

    try {
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
      const firstChunk = await waitForStreamData(response.data);
      expect(firstChunk).toContain('Participant');
      expect(feed).toHaveBeenCalledTimes(1);
      expect(auth.authenticateSession).toHaveBeenCalledWith('session-1');
      expect(authorize).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'collector-user' }),
        [Permission.EventAttendance.Read],
        { eventId: 'event-1' },
      );

      const close = waitForStreamClose(response.data);
      response.data.destroy();
      await close;
      await new Promise((resolve) => setTimeout(resolve, 2_100));

      expect(feed).toHaveBeenCalledTimes(1);
    } finally {
      response.data.destroy();
    }
  });

  it('closes the HTTP SSE stream when canonical authorization is revoked', async () => {
    authorize.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(
      new ForbiddenException('Permission revoked.'),
    );
    const response = await axios.get('/event-attendances/events/event-1/scanner-feed/events', {
      headers: { cookie: `${AUTH_SESSION_COOKIE_NAME}=session-1` },
      responseType: 'stream',
      timeout: 5_000,
    });

    try {
      const chunks: string[] = [];
      response.data.on('data', (chunk: Buffer | string) => chunks.push(chunk.toString()));
      let closed = false;
      try {
        await waitForStreamData(response.data);
        feed.mockResolvedValueOnce([
          {
            personId: 'revoked-person',
            eventId: 'event-1',
            fullName: 'Should not be fetched',
          },
        ]);
        const close = waitForStreamClose(response.data, 5_000);
        response.data.resume();
        await close;
        closed = true;
      } finally {
        if (!closed) {
          response.data.destroy();
        }
      }

      expect(feed).toHaveBeenCalledTimes(1);
      expect(chunks.join('')).not.toContain('Should not be fetched');
    } finally {
      response.data.destroy();
    }
  });
});

function waitForStreamData(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      const value = chunk.toString();
      if (!value.trim()) {
        return;
      }

      stream.removeListener('data', onData);
      stream.removeListener('error', onError);
      resolve(value);
    };
    const onError = (error: unknown) => {
      stream.removeListener('data', onData);
      reject(error);
    };
    stream.on('data', onData);
    stream.once('error', onError);
  });
}

function waitForStreamClose(stream: NodeJS.ReadableStream, timeoutMs = 2_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for SSE stream close.')), timeoutMs);
    stream.once('close', () => {
      clearTimeout(timeout);
      resolve();
    });
    stream.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}
