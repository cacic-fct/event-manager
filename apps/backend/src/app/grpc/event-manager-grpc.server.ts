import {
  Metadata,
  Server,
  ServerCredentials,
  status,
  type handleUnaryCall,
  type ServiceError,
  type sendUnaryData,
  type ServerUnaryCall,
  type UntypedServiceImplementation,
} from '@grpc/grpc-js';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
import { AccountMergeService } from '../account-merge/account-merge.service';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { LgpdService } from '../lgpd/lgpd.service';
import { VotingIntegrationService } from '../voting-integration/service';
import { loadGrpcServiceDefinition, resolveGrpcProtoPath } from './grpc-runtime';

type GrpcRequest = Record<string, unknown>;
type GrpcResponse = Record<string, unknown>;

type EventManagerGrpcDependencies = {
  accountMerge: AccountMergeService;
  auth: KeycloakAuthService;
  currentUserContext: CurrentUserContextService;
  lgpd: LgpdService;
  voting: VotingIntegrationService;
};

const logger = new Logger('EventManagerGrpc');

export async function startEventManagerGrpcServer(app: INestApplication): Promise<Server> {
  const server = new Server({
    'grpc.max_receive_message_length': 4 * 1024 * 1024,
    'grpc.max_send_message_length': 4 * 1024 * 1024,
  });
  const service = loadGrpcServiceDefinition(
    resolveGrpcProtoPath('cacic/m2m/event_manager/v1/event-manager-m2m.proto'),
    ['cacic', 'm2m', 'event_manager', 'v1'],
    'EventManagerM2M',
  );

  server.addService(
    service,
    createEventManagerGrpcHandlers({
      accountMerge: app.get(AccountMergeService),
      auth: app.get(KeycloakAuthService),
      currentUserContext: app.get(CurrentUserContextService),
      lgpd: app.get(LgpdService),
      voting: app.get(VotingIntegrationService),
    }),
  );

  const bindUrl = process.env.EVENT_MANAGER_GRPC_BIND_URL?.trim() || '0.0.0.0:50051';
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(bindUrl, ServerCredentials.createInsecure(), (error) => (error ? reject(error) : resolve()));
  });
  logger.log(`Event Manager M2M gRPC server is listening on ${bindUrl}.`);
  return server;
}

export function createEventManagerGrpcHandlers(
  dependencies: EventManagerGrpcDependencies,
): UntypedServiceImplementation {
  return {
    listVotingEvents: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['voting-integration:read'], signal);
      const events = await dependencies.voting.listLinkableEvents();
      return {
        events: events.map((event) => ({
          ...event,
          startDate: toDateTime(event.startDate),
          endDate: toDateTime(event.endDate),
        })),
      };
    }),
    checkVotingAttendance: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['voting-integration:read'], signal);
      const eventId = requiredString(call.request, 'eventId');
      const userId = requiredString(call.request, 'userId');
      const result = await dependencies.voting.checkAttendance(eventId, userId);
      return {
        ...result,
        attendedAt: result.attendedAt ? toDateTime(result.attendedAt) : undefined,
      };
    }),
    syncAccountProfile: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['account-profile:write'], signal);
      const { user, person } = await dependencies.currentUserContext.syncProfileUpdate({
        userId: requiredString(call.request, 'userId'),
        ...optionalStringFields(call.request, ['email', 'name', 'fullname', 'phone', 'identityDocument', 'academicId']),
        unespRole: stringArray(call.request, 'unespRole'),
        ...(typeof call.request['isOnboarded'] === 'boolean' ? { isOnboarded: call.request['isOnboarded'] } : {}),
      });
      return {
        status: 'success',
        userId: user?.id,
        personId: person?.id,
      };
    }),
    scoreAccountMerge: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['account-merge:score'], signal);
      const response = await dependencies.accountMerge.scoreAccountMergeCandidates({
        userIds: stringArray(call.request, 'userIds'),
      });
      return {
        scores: Object.entries(response.scores).map(([userId, score]) => ({
          userId,
          score,
        })),
      };
    }),
    applyAccountMerge: unary(async (call, signal) => {
      const principal = await authorize(call.metadata, dependencies.auth, ['account-merge:write'], signal);
      const type = requiredString(call.request, 'type');
      if (type !== 'account.merged') {
        throw new BadRequestException('type must be account.merged.');
      }
      return {
        ...(await dependencies.accountMerge.acknowledgeAccountMerge(
          {
            eventId: requiredString(call.request, 'eventId'),
            type,
            oldUserId: requiredString(call.request, 'oldUserId'),
            newUserId: requiredString(call.request, 'newUserId'),
            occurredAt: requiredString(call.request, 'occurredAt'),
          },
          readClientId(principal),
        )),
      };
    }),
    collectLgpdUserData: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['lgpd:read'], signal);
      const response = await dependencies.lgpd.collectUserData({
        userId: requiredString(call.request, 'userId'),
        ...optionalStringFields(call.request, ['email']),
      });
      return { json: JSON.stringify(response) };
    }),
    scheduleLgpdDeletion: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['lgpd:delete'], signal);
      const response = await dependencies.lgpd.scheduleDeletion(lgpdDeletionInput(call.request));
      return { json: JSON.stringify(response) };
    }),
    cancelLgpdDeletion: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['lgpd:delete'], signal);
      const response = await dependencies.lgpd.cancelDeletion(lgpdDeletionInput(call.request));
      return { json: JSON.stringify(response) };
    }),
    deleteLgpdData: unary(async (call, signal) => {
      await authorize(call.metadata, dependencies.auth, ['lgpd:delete'], signal);
      const response = await dependencies.lgpd.hardDelete(lgpdDeletionInput(call.request));
      return { json: JSON.stringify(response) };
    }),
  };
}

function unary(
  handler: (call: ServerUnaryCall<GrpcRequest, GrpcResponse>, signal: AbortSignal) => Promise<GrpcResponse>,
): handleUnaryCall<GrpcRequest, GrpcResponse> {
  return (call: ServerUnaryCall<GrpcRequest, GrpcResponse>, callback: sendUnaryData<GrpcResponse>) => {
    const abortController = new AbortController();
    const cancellableCall = call as ServerUnaryCall<GrpcRequest, GrpcResponse> & {
      getDeadline?: () => Date | number;
      off?: (event: 'cancelled', listener: () => void) => void;
      on?: (event: 'cancelled', listener: () => void) => void;
    };
    const abort = (code: status, details: string) => {
      if (!abortController.signal.aborted) {
        abortController.abort(new GrpcCallTerminatedError(code, details));
      }
    };
    const onCancelled = () => abort(status.CANCELLED, 'gRPC request was cancelled.');
    cancellableCall.on?.('cancelled', onCancelled);
    if (call.cancelled) {
      onCancelled();
    }

    const deadline = cancellableCall.getDeadline?.();
    const deadlineAt = deadline instanceof Date ? deadline.getTime() : deadline;
    const deadlineDelay = typeof deadlineAt === 'number' && Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : null;
    if (deadlineDelay != null && deadlineDelay <= 0) {
      abort(status.DEADLINE_EXCEEDED, 'gRPC request deadline exceeded.');
    }
    const deadlineTimer =
      deadlineDelay == null || deadlineDelay <= 0
        ? undefined
        : setTimeout(() => abort(status.DEADLINE_EXCEEDED, 'gRPC request deadline exceeded.'), deadlineDelay);
    deadlineTimer?.unref();

    void Promise.race([handler(call, abortController.signal), rejectionOnAbort(abortController.signal)])
      .then(
        (response) => callback(null, response),
        (error: unknown) => callback(toServiceError(error), null),
      )
      .finally(() => {
        if (deadlineTimer) {
          clearTimeout(deadlineTimer);
        }
        cancellableCall.off?.('cancelled', onCancelled);
      });
  };
}

async function authorize(
  metadata: Metadata,
  auth: KeycloakAuthService,
  roles: string[],
  signal: AbortSignal,
): Promise<AuthenticatedUser> {
  throwIfCallTerminated(signal);
  const authorization = metadata.get('authorization')[0];
  const header = Buffer.isBuffer(authorization) ? authorization.toString('utf8') : authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
    throw new UnauthorizedException('Missing gRPC authorization metadata.');
  }

  const principal = await auth.authenticateAccessToken(header.slice('Bearer '.length));
  throwIfCallTerminated(signal);
  return auth.assertMachineToMachinePrincipal(principal, { requiredRoles: roles });
}

class GrpcCallTerminatedError extends Error {
  constructor(
    readonly code: status,
    readonly details: string,
  ) {
    super(details);
  }
}

function rejectionOnAbort(signal: AbortSignal): Promise<never> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

function throwIfCallTerminated(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason;
  }
}

function lgpdDeletionInput(request: GrpcRequest): { requestId: string; userId: string; email?: string } {
  return {
    requestId: requiredString(request, 'requestId'),
    userId: requiredString(request, 'userId'),
    ...optionalStringFields(request, ['email']),
  };
}

function requiredString(value: GrpcRequest, key: string): string {
  const raw = value[key];
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new BadRequestException(`${key} is required.`);
  }
  return raw.trim();
}

function stringArray(value: GrpcRequest, key: string): string[] {
  const raw = value[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalStringFields<T extends readonly string[]>(
  value: GrpcRequest,
  keys: T,
): Partial<Record<T[number], string>> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const raw = value[key];
      return typeof raw === 'string' && raw.trim() ? [[key, raw.trim()]] : [];
    }),
  ) as Partial<Record<T[number], string>>;
}

function readClientId(user: AuthenticatedUser): string | null {
  const clientId = user.claims['azp'] ?? user.claims['client_id'];
  return typeof clientId === 'string' && clientId.trim() ? clientId.trim() : (user.sub ?? null);
}

function toDateTime(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toServiceError(error: unknown): ServiceError {
  const code =
    error instanceof GrpcCallTerminatedError
      ? error.code
      : error instanceof HttpException
        ? grpcStatusForHttpStatus(error.getStatus())
        : status.INTERNAL;
  const details =
    error instanceof GrpcCallTerminatedError
      ? error.details
      : error instanceof HttpException
        ? error.message
        : 'Internal gRPC service error.';

  return Object.assign(new Error(details), {
    code,
    details,
    metadata: new Metadata(),
  });
}

function grpcStatusForHttpStatus(httpStatus: number): status {
  switch (httpStatus) {
    case HttpStatus.BAD_REQUEST:
      return status.INVALID_ARGUMENT;
    case HttpStatus.UNAUTHORIZED:
      return status.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return status.PERMISSION_DENIED;
    case HttpStatus.NOT_FOUND:
      return status.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return status.ALREADY_EXISTS;
    case HttpStatus.REQUEST_TIMEOUT:
    case HttpStatus.GATEWAY_TIMEOUT:
      return status.DEADLINE_EXCEEDED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return status.UNAVAILABLE;
    default:
      return status.INTERNAL;
  }
}
