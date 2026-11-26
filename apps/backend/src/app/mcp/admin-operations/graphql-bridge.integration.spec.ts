import { PlacePreset, PlacePresetUpdateInput } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import {
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Injectable,
  type INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Args, Context, GraphQLModule, GraphQLSchemaHost, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { execute, parse } from 'graphql';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { RequireRoles } from '../../auth/decorators/require-roles.decorator';
import { KeycloakScopeGuard } from '../../auth/guards/keycloak-scope.guard';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../../auth/keycloak-auth.service';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { PermissionManagementResolver } from '../../authorization/permission-management.resolver';
import { PermissionManagementService } from '../../authorization/permission-management.service';
import { DataTransferService } from '../../data-transfer/data-transfer.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { McpAdminConfig } from '../mcp-admin.config';
import { adminMcpExecution } from './execution-context';
import { AdminMcpGraphqlBridge, boundedJson } from './graphql-bridge';
import { AdminMcpRestOperations } from './rest-operations';
const { jest } = import.meta;

@Injectable()
class BridgeDomainFixture {
  seenUser?: AuthenticatedUser;
  read(id: string, request: { user: AuthenticatedUser }) {
    this.seenUser = request.user;
    const now = new Date();
    return { id, name: 'Local de teste', createdAt: now, updatedAt: now, deletedAt: null };
  }
  write(id: string, request: { user: AuthenticatedUser }) {
    return this.read(id, request);
  }
}
@Resolver()
@RequireRoles('access')
class BridgeResolverFixture {
  constructor(private readonly domain: BridgeDomainFixture) {}
  @Query(() => PlacePreset, { name: 'placePreset' })
  @RequirePermissions(Permission.PlacePreset.Read)
  place(@Args('id') id: string, @Context('req') request: { user: AuthenticatedUser }) {
    return this.domain.read(id, request);
  }
  @Mutation(() => PlacePreset, { name: 'updatePlacePreset' })
  @RequirePermissions(Permission.PlacePreset.Update)
  update(
    @Args('id') id: string,
    @Args('input') _input: PlacePresetUpdateInput,
    @Context('req') request: { user: AuthenticatedUser },
  ) {
    return this.domain.write(id, request);
  }
}
function user(onboarded = true): AuthenticatedUser {
  return {
    sub: 'operator',
    token: 'original-private-bearer',
    claims: { is_onboarded: onboarded },
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
  };
}
const execution = { phase: 'read' as const, delegationId: 'delegation', clientId: 'client', operation: 'placePreset' };

describe('administrative MCP bridge through actual Nest GraphQL guards', () => {
  let app: INestApplication;
  let bridge: AdminMcpGraphqlBridge;
  let domain: BridgeDomainFixture;
  const prisma = {
    eventManagerRole: { findMany: jest.fn(async () => []) },
    eventManagerPermissionGroup: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(() => {
      throw new Error('Read attempted permission cleanup');
    }),
  };
  const auth = { authenticateAccessToken: jest.fn(), authenticateSession: jest.fn(), assertClientRoles: jest.fn() };
  const policy = { assertPermissions: jest.fn(async () => undefined), buildResourceContext: jest.fn(() => ({})) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLModule.forRoot<ApolloDriverConfig>({ driver: ApolloDriver, autoSchemaFile: true })],
      providers: [
        BridgeDomainFixture,
        BridgeResolverFixture,
        PermissionManagementResolver,
        PermissionManagementService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: {} },
        {
          provide: DataTransferService,
          useValue: {
            getSchema: jest.fn(async () => ({ format: 'cacic-event-data', version: 1 })),
            export: jest.fn(async () => ({ document: { resources: [] }, issues: [] })),
            preview: jest.fn(async () => ({ items: [], summary: {}, planHash: '0'.repeat(64), canApply: false })),
            history: jest.fn(async () => []),
            apply: jest.fn(async () => ({ applied: true })),
            validateReviewedApply: jest.fn(async () => undefined),
            undo: jest.fn(async () => ({ undone: true })),
            validateUndo: jest.fn(async () => undefined),
          },
        },
        AdminMcpRestOperations,
        AdminMcpGraphqlBridge,
        { provide: McpAdminConfig, useValue: { resourceUrl: 'https://events.example.test/api/mcp/admin' } },
        { provide: AuthorizationPolicyService, useValue: policy },
        { provide: KeycloakAuthService, useValue: auth },
        { provide: APP_GUARD, useClass: KeycloakScopeGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    bridge = app.get(AdminMcpGraphqlBridge);
    domain = app.get(BridgeDomainFixture);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    policy.assertPermissions.mockResolvedValue(undefined);
    auth.assertClientRoles.mockReset();
  });

  it('executes only a known projection through onboarding, current roles and current permissions', async () => {
    const original = user();
    await expect(bridge.execute('placePreset', { id: 'place-a' }, original, execution)).resolves.toEqual(
      expect.objectContaining({ id: 'place-a', name: 'Local de teste' }),
    );
    expect(domain.seenUser).toEqual(
      expect.objectContaining({ sub: 'operator', token: '', authenticationTransport: 'mcp' }),
    );
    expect(original.token).toBe('original-private-bearer');
    expect(auth.authenticateAccessToken).not.toHaveBeenCalled();
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(auth.assertClientRoles).toHaveBeenCalledWith(expect.objectContaining({ sub: 'operator' }), ['access']);
    expect(policy.assertPermissions).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'operator' }),
      [Permission.PlacePreset.Read],
      expect.any(Object),
    );
    expect(adminMcpExecution.getStore()).toBeUndefined();
  });

  it.each(['permissionRoles', 'permissionGroups'])(
    'executes %s without writes even when nothing has expired',
    async (field) => {
      const result = await bridge.execute(field, {}, user(), { ...execution, operation: field });
      expect(Array.isArray(result)).toBe(true);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(
        field === 'permissionRoles' ? prisma.eventManagerRole.findMany : prisma.eventManagerPermissionGroup.findMany,
      ).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['onboarding', 'roles', 'permissions'])('retains the actual Nest %s denial', async (boundary) => {
    const spy = jest.spyOn(domain, 'read');
    if (boundary === 'roles')
      auth.assertClientRoles.mockImplementation(() => {
        throw new ForbiddenException();
      });
    if (boundary === 'permissions') policy.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(
      bridge.execute('placePreset', { id: 'place-a' }, user(boundary !== 'onboarding'), execution),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it.each([
    [new NotFoundException('Local inexistente.'), 'Local inexistente.'],
    [new InternalServerErrorException('Private diagnostic'), 'O serviço responsável recusou'],
    [new Error('Private diagnostic'), 'O serviço responsável recusou'],
  ])('preserves only expected public GraphQL errors: %s', async (error, message) => {
    const spy = jest.spyOn(domain, 'read').mockImplementation(() => {
      throw error;
    });
    try {
      await expect(bridge.execute('placePreset', { id: 'missing' }, user(), execution)).rejects.toThrow(message);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects a forged normal GraphQL request even when its user and headers look internal', async () => {
    const schema = app.get(GraphQLSchemaHost).schema;
    const result = await execute({
      schema,
      document: parse('{ placePreset(id: "place-a") { id } }'),
      contextValue: { req: { headers: { 'x-mcp-internal': 'true' }, user: user(), body: { internal: true } } },
    });
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(auth.assertClientRoles).not.toHaveBeenCalled();
    expect(policy.assertPermissions).not.toHaveBeenCalled();
  });

  it('rejects unknown fields, GraphQL documents, extra arguments and read-phase mutations before domain calls', async () => {
    const spy = jest.spyOn(domain, 'write');
    expect(() => bridge.arguments('placePreset', { id: 'place-a', query: 'mutation { updatePlacePreset }' })).toThrow();
    expect(() => bridge.operation('query { placePreset { id } }')).toThrow();
    expect(() => bridge.operation('unknownOperation')).toThrow();
    await expect(
      bridge.execute('updatePlacePreset', { id: 'place-a', input: { name: 'Alterado' } }, user(), execution),
    ).rejects.toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('bounds input values and rejects prototype keys, non-finite numbers and oversize arrays', () => {
    expect(boundedJson({ input: Array.from({ length: 201 }, () => 'id') })).toBe(false);
    expect(boundedJson({ input: Number.POSITIVE_INFINITY })).toBe(false);
    expect(boundedJson(JSON.parse('{"constructor":"forged"}'))).toBe(false);
    expect(() => bridge.arguments('placePreset', { id: 'x'.repeat(65000) })).toThrow();
    expect(bridge.coverage().unavailable.length).toBeGreaterThan(0);
    expect(
      bridge
        .catalog()
        .map((entry) => entry.field)
        .sort(),
    ).toEqual([
      'applyDataTransfer',
      'archivePermissionGroup',
      'archivePermissionRole',
      'dataTransferHistory',
      'dataTransferSchema',
      'exportDataTransfer',
      'permissionGroups',
      'permissionRoles',
      'permissionScopeTargets',
      'placePreset',
      'previewDataTransfer',
      'savePermissionGroup',
      'savePermissionRole',
      'undoDataTransfer',
      'updatePlacePreset',
    ]);
  });

  it('routes REST-only transfer operations through the typed service adapter', async () => {
    const result = await bridge.execute('dataTransferSchema', {}, user(), {
      ...execution,
      operation: 'dataTransferSchema',
    });
    expect(result).toEqual({ format: 'cacic-event-data', version: 1 });
    expect(() =>
      bridge.arguments('exportDataTransfer', { target: { kind: 'event', id: 'e1' }, extra: true }),
    ).toThrow();
  });
});
