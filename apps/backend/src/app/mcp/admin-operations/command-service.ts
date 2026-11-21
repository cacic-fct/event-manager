import { lockCommandTargets, commandTargetLabels } from './transaction-freshness';
import type {
  AdminMcpCommand,
  AdminMcpCommandDecision,
  AdminMcpCommandPage,
  AdminMcpCommandPreview,
  AdminMcpCommandReview,
  AdminMcpDelegation,
  AdminMcpDelegationInput,
  AdminMcpCommandState,
} from '@cacic-fct/event-manager-mcp-contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  type McpAdminCommand,
  type McpAdminOperationDelegation,
  Prisma,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { runSerializablePrismaTransaction } from '../../common/serializable-prisma-transaction';
import { PrismaService } from '../../prisma/prisma.service';
import { McpAdminAccessService } from '../mcp-admin-access.service';
import { McpAdminConfig, MCP_ADMIN_PROPOSE_SCOPE, MCP_ADMIN_READ_SCOPE } from '../mcp-admin.config';
import { McpAdminInvalidationService } from '../mcp-admin-invalidation.service';
import { mcpUserId } from '../mcp-admin-principal';
import { assertMcpReviewToken, canonicalMcpValue, signMcpReview } from '../mcp-review-token';
import { parseMcpInput } from '../mcp-admin.schemas';
import { AdminMcpGraphqlBridge } from './graphql-bridge';
import { AdminMcpScopePolicy, operationContexts } from './scope-policy';
import { Permission } from '@cacic-fct/shared-permissions';
import { adminScopeSchema } from './schemas';

function json(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
function identifiers(value: unknown, prefix = ''): Map<string, string[]> {
  const result = new Map<string, string[]>();
  if (typeof value !== 'object' || value === null) return result;
  for (const [key, item] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if ((key === 'id' || /Ids?$/.test(key)) && (typeof item === 'string' || Array.isArray(item)))
      result.set(
        path,
        (Array.isArray(item) ? item : [item]).filter((id): id is string => typeof id === 'string').sort(),
      );
    if (item && typeof item === 'object') for (const [nested, ids] of identifiers(item, path)) result.set(nested, ids);
  }
  return result;
}
function preserveTargets(original: unknown, reviewed: unknown): void {
  const before = identifiers(original);
  const after = identifiers(reviewed);
  for (const [path, ids] of before) {
    if (ids.length === 1 && !isDeepStrictEqual(ids, after.get(path)))
      throw new BadRequestException('O identificador original deve ser preservado.');
  }
  for (const [path, ids] of identifiers(reviewed)) {
    const allowed = before.get(path) ?? [];
    if (ids.some((id) => !allowed.includes(id)))
      throw new BadRequestException('O destino original não pode ser trocado na revisão. Crie outra proposta.');
  }
}

@Injectable()
export class AdminMcpCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: McpAdminAccessService,
    private readonly config: McpAdminConfig,
    private readonly bridge: AdminMcpGraphqlBridge,
    private readonly scopes: AdminMcpScopePolicy,
    private readonly policy: AuthorizationPolicyService,
    private readonly audit: AuditLogService,
    private readonly invalidations: McpAdminInvalidationService,
  ) {}
  catalog() {
    return this.bridge.catalog();
  }
  coverage() {
    return this.bridge.coverage();
  }
  private assertOAuth(user: AuthenticatedUser, scope: string): void {
    if (!user.oidcScopeSet.has(scope)) throw new ForbiddenException('Escopo OAuth insuficiente.');
  }
  async delegations(user: AuthenticatedUser, clientOnly = false): Promise<AdminMcpDelegation[]> {
    const now = new Date();
    const active = { userId: mcpUserId(user), revokedAt: null, expiresAt: { gt: now } };
    const orderBy = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
    if (!clientOnly) {
      const [current, history] = await Promise.all([
        this.prisma.mcpAdminOperationDelegation.findMany({ where: active, orderBy: [...orderBy] }),
        this.prisma.mcpAdminOperationDelegation.findMany({
          where: { userId: mcpUserId(user), OR: [{ revokedAt: { not: null } }, { expiresAt: { lte: now } }] },
          orderBy: [...orderBy],
          take: 50,
        }),
      ]);
      return [...current, ...history].map((row) => this.delegation(row));
    }
    const rows = await this.prisma.mcpAdminOperationDelegation.findMany({
      where: {
        ...active,
        clientId: String(user.claims['azp']),
        resource: this.config.resourceUrl,
      },
      orderBy: [...orderBy],
      take: 50,
    });
    return rows.map((row) => this.delegation(row));
  }
  async createDelegation(user: AuthenticatedUser, input: AdminMcpDelegationInput): Promise<AdminMcpDelegation> {
    if (!this.config.enabled || !this.config.allowedClients.includes(input.clientId))
      throw new ForbiddenException('Aplicativo MCP indisponível.');
    const now = new Date();
    const expiresAt = new Date(input.expiresAt);
    if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 86400000)
      throw new BadRequestException('Use uma validade de até 24 horas.');
    const scope = parseMcpInput(adminScopeSchema, input.scope);
    for (const field of input.operations) {
      const operation = this.bridge.operation(field).definition;
      if (operation.kind === 'mutation' && !this.config.proposalsEnabled)
        throw new ForbiddenException('Propostas desativadas.');
      if (operation.personalData && !input.personalData)
        throw new BadRequestException('Esta seleção exige consentimento explícito de dados pessoais.');
      if (scope.mode === 'RESOURCE' && (operation.target === 'GLOBAL' || operation.target.mode !== 'ARGUMENTS'))
        throw new BadRequestException('Uma operação selecionada exige o escopo abrangente explícito.');
    }
    const row = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await this.access.assertEligible(user, tx);
      if (
        (await tx.mcpAdminOperationDelegation.count({
          where: { userId: mcpUserId(user), revokedAt: null, expiresAt: { gt: now } },
        })) >= 10
      )
        throw new BadRequestException('Revogue uma delegação antes de criar outra.');
      const created = await tx.mcpAdminOperationDelegation.create({
        data: {
          ...input,
          scope: json(scope),
          userId: mcpUserId(user),
          resource: this.config.resourceUrl,
          createdAt: now,
          expiresAt,
        },
      });
      await this.queueAudit(tx, user, created.id, 'Delegação administrativa MCP criada.', { clientId: input.clientId });
      return created;
    });
    await this.invalidations.publish(mcpUserId(user));
    return this.delegation(row);
  }
  async revoke(user: AuthenticatedUser, id: string): Promise<void> {
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const row = await tx.mcpAdminOperationDelegation.findFirst({ where: { id, userId: mcpUserId(user) } });
      if (!row) throw new NotFoundException('Delegação não encontrada.');
      await tx.mcpAdminOperationDelegation.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.queueAudit(tx, user, id, 'Delegação administrativa MCP revogada.', { clientId: row.clientId });
    });
    await this.invalidations.publish(mcpUserId(user));
  }
  private delegation(row: McpAdminOperationDelegation): AdminMcpDelegation {
    return {
      id: row.id,
      clientId: row.clientId,
      operations: row.operations,
      scope: parseMcpInput(adminScopeSchema, row.scope),
      personalData: row.personalData,
      maxProposals: row.maxProposals,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    };
  }
  private async grant(
    user: AuthenticatedUser,
    id: string,
    field: string,
    args: Record<string, unknown>,
    phase: 'read' | 'propose' | 'apply',
  ): Promise<McpAdminOperationDelegation> {
    await this.access.assertEligible(user);
    if (!this.config.enabled || (phase !== 'read' && !this.config.proposalsEnabled))
      throw new ForbiddenException('Operação MCP desativada.');
    if (phase !== 'apply') this.assertOAuth(user, phase === 'read' ? MCP_ADMIN_READ_SCOPE : MCP_ADMIN_PROPOSE_SCOPE);
    const row = await this.prisma.mcpAdminOperationDelegation.findFirst({
      where: { id, userId: mcpUserId(user), ...(phase !== 'apply' ? { clientId: String(user.claims['azp']) } : {}) },
    });
    const operation = this.bridge.operation(field).definition;
    if (
      !row ||
      row.revokedAt ||
      row.expiresAt <= new Date() ||
      row.resource !== this.config.resourceUrl ||
      !this.config.allowedClients.includes(row.clientId) ||
      !row.operations.includes(field) ||
      (operation.personalData && !row.personalData)
    )
      throw new ForbiddenException('Delegação expirada, revogada ou sem essa operação.');
    const scope = parseMcpInput(adminScopeSchema, row.scope);
    await this.scopes.operation(scope, operation, args);
    if (operation.permissions.length) {
      const contexts = operationContexts(operation, args, this.policy);
      if (contexts.length) {
        for (const context of contexts) await this.policy.assertPermissions(user, operation.permissions, context);
      } else {
        const context = this.policy.buildResourceContext(args, operation.permissions);
        await this.policy.assertPermissions(user, operation.permissions, {
          ...context,
          allowScopedCollection: operation.kind === 'query',
        });
      }
    } else if (operation.kind === 'mutation') {
      // Dynamic permission decisions still run in the owning service. Admission
      // requires a current relevant grant, or super-admin, before a proposal exists.
      const known: Record<string, readonly Permission[]> = {
        savePermissionRole: [
          args['input'] && typeof args['input'] === 'object' && 'id' in args['input'] && Boolean(args['input'].id)
            ? Permission.PermissionGrant.Update
            : Permission.PermissionGrant.Create,
        ],
        savePermissionGroup: [
          args['input'] && typeof args['input'] === 'object' && 'id' in args['input'] && Boolean(args['input'].id)
            ? Permission.PermissionGrant.Update
            : Permission.PermissionGrant.Create,
        ],
        updateEventMaterials: [Permission.Event.Update],
      };
      if (known[field])
        await this.policy.assertPermissions(user, known[field], this.policy.buildResourceContext(args, known[field]));
      else if (!this.policy.isSuperAdmin(user))
        throw new ForbiddenException('Esta operação dinâmica exige validação administrativa adicional.');
    }
    return row;
  }
  async read(user: AuthenticatedUser, delegationId: string, field: string, input: unknown): Promise<unknown> {
    const operation = this.bridge.operation(field);
    if (operation.definition.kind !== 'query') throw new BadRequestException('Esta ferramenta só consulta.');
    const args = this.bridge.arguments(field, input);
    const row = await this.grant(user, delegationId, field, args, 'read');
    const scope = parseMcpInput(adminScopeSchema, row.scope);
    return this.bridge.execute(field, args, user, {
      phase: 'read',
      delegationId: row.id,
      clientId: row.clientId,
      operation: field,
      assertScope: (permissions, context) => this.scopes.assert(scope, permissions, context),
    });
  }
  private async fingerprint(
    field: string,
    args: Record<string, unknown>,
    client: Pick<Prisma.TransactionClient, '$queryRaw'> = this.prisma,
    ownProposalId = '',
  ): Promise<string> {
    // Bind freshness to the referenced resources, not unrelated live matches or
    // attendance scans elsewhere. Untargeted global operations remain conservative.
    const references = [...new Set([...identifiers(args).values()].flat())];
    const eventIds = [...identifiers(args)].filter(([path]) => /\.eventIds?$/.test(path)).flatMap(([, ids]) => ids);
    const personIds = [...identifiers(args)].filter(([path]) => /\.personIds?$/.test(path)).flatMap(([, ids]) => ids);
    for (const eventId of eventIds)
      for (const personId of personIds) references.push(`${personId}:${eventId}`, `${eventId}:${personId}`);
    const targets = references.length ? Prisma.sql`AND "entityId" IN (${Prisma.join(references)})` : Prisma.empty;
    const rows = await client.$queryRaw<{ id: string; lastRecordedAt: Date; groupedCount: number }[]>`
      SELECT "id", "lastRecordedAt", "groupedCount" FROM "audit_log_entries"
      WHERE COALESCE("metadata"->>'queueOnly', 'false') <> 'true'
        AND (${ownProposalId} = '' OR COALESCE("metadata"->>'proposalId', '') <> ${ownProposalId})
        ${targets}
      ORDER BY "lastRecordedAt" DESC, "id" DESC LIMIT 1
    `;
    const latest = rows[0] ?? null;
    return createHash('sha256')
      .update(JSON.stringify(canonicalMcpValue([field, args, latest])))
      .digest('hex');
  }
  async propose(user: AuthenticatedUser, delegationId: string, field: string, input: unknown, key: string) {
    const operation = this.bridge.operation(field);
    if (operation.definition.kind !== 'mutation') throw new BadRequestException('Esta operação não é uma alteração.');
    const args = this.bridge.arguments(field, input);
    const row = await this.grant(user, delegationId, field, args, 'propose');
    const sameProposal = (command: McpAdminCommand) => {
      if (command.operation !== field || !isDeepStrictEqual(command.arguments, args))
        throw new ConflictException('Chave já usada para outra proposta.');
      return command;
    };
    const existing = await this.prisma.mcpAdminCommand.findUnique({
      where: { delegationId_idempotencyKey: { delegationId, idempotencyKey: key } },
    });
    if (existing) {
      return this.statusResult(sameProposal(existing));
    }
    const fingerprint = await this.fingerprint(field, args);
    const created = await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const previous = await tx.mcpAdminCommand.findUnique({
        where: { delegationId_idempotencyKey: { delegationId, idempotencyKey: key } },
      });
      if (previous) return sameProposal(previous);
      const active = await tx.mcpAdminOperationDelegation.findFirst({
        where: { id: row.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!active || (await tx.mcpAdminCommand.count({ where: { delegationId } })) >= active.maxProposals)
        throw new ForbiddenException('Delegação indisponível ou limite de propostas atingido.');
      const proposal = await tx.mcpAdminCommand.create({
        data: {
          delegationId,
          operation: field,
          arguments: json(args),
          fingerprint,
          idempotencyKey: key,
          expiresAt: new Date(Math.min(row.expiresAt.getTime(), Date.now() + 3600000)),
        },
      });
      await this.queueAudit(tx, user, proposal.id, 'Operação administrativa MCP enviada para revisão.', {
        operation: field,
        delegationId,
        clientId: row.clientId,
      });
      return proposal;
    }).catch(async (error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.mcpAdminCommand.findUnique({
          where: { delegationId_idempotencyKey: { delegationId, idempotencyKey: key } },
        });
        if (winner) return sameProposal(winner);
      }
      throw error;
    });
    await this.invalidations.publish(mcpUserId(user));
    return this.statusResult(created);
  }
  private statusResult(command: McpAdminCommand) {
    return {
      proposalId: command.id,
      state: command.state,
      expiresAt: command.expiresAt,
      reviewUrl: new URL(`/admin/mcp/operations?proposal=${command.id}`, this.config.applicationOrigin).href,
      appliesAutomatically: false,
    };
  }
  async status(user: AuthenticatedUser, id: string) {
    const command = await this.owned(user, id);
    await this.grant(
      user,
      command.delegationId,
      command.operation,
      command.arguments as Record<string, unknown>,
      'propose',
    );
    return this.statusResult(command);
  }
  private async owned(user: AuthenticatedUser, id: string) {
    const command = await this.prisma.mcpAdminCommand.findFirst({
      where: { id, delegation: { userId: mcpUserId(user) } },
      include: { delegation: true },
    });
    if (!command) throw new NotFoundException('Proposta não encontrada.');
    return command;
  }
  private effects(field: string): string {
    const { definition, info } = this.bridge.operation(field);
    const effects: Record<string, string> = {
      authorization: 'Pode alterar cargos, grupos, atribuições e a autoridade de pessoas e cargos descendentes.',
      publishing:
        'Pode alterar a visibilidade pública, agendamentos e o estado de recursos relacionados da programação.',
      'ticket-purchases':
        'Pode aprovar ou rejeitar compras e afetar inscrições, pagamentos e disponibilidade de bilhetes.',
      'major-event-receipts': 'Pode alterar decisões de pagamento e a situação das inscrições ou bilhetes associados.',
      certificate:
        'Pode emitir, substituir, revogar ou alterar certificados e seus arquivos. Confira a pessoa e a configuração.',
      people:
        'Pode alterar dados pessoais e vínculos. Mesclas e exclusões podem afetar inscrições, bilhetes e certificados.',
      'event-forms': 'Pode alterar formulários, versões, publicação, vínculos e consequências próprias do formulário.',
      sports:
        'Pode alterar competição, equipes, elegibilidade, súmulas, placar, classificação, arbitragem ou partidas, conforme a operação.',
      'prize-draw': 'Pode modificar participantes elegíveis, resultados e decisões do sorteio.',
    };
    const destruction = /^(?:delete|archive|merge|revert|undo)/i.test(field)
      ? ' A remoção, mescla ou reversão pode afetar dependentes e não ser reversível.'
      : '';
    return `${info.label}. ${effects[definition.domain] ?? 'Aplica a alteração pelos serviços administrativos existentes e pode afetar recursos relacionados.'}${destruction} Confira os destinos e todos os argumentos finais.`;
  }
  private async reviewEffects(field: string, args: Record<string, unknown>): Promise<string> {
    const effects = this.effects(field);
    if (field !== 'updateEvent') return effects;
    const event = await this.prisma.event.findFirst({
      where: { id: String(args['id']), deletedAt: null },
      select: { publicationState: true },
    });
    const input = args['input'] as Record<string, unknown>;
    if (input['publishAfterUpdate'] === true) {
      return `${effects} O evento ficará publicado após a atualização.`;
    }
    if (event?.publicationState === 'PUBLISHED') {
      return `${effects} O evento sairá de publicação e ficará em rascunho.`;
    }
    if (event?.publicationState === 'SCHEDULED') {
      return `${effects} O agendamento de publicação será cancelado e o evento ficará em rascunho.`;
    }
    return effects;
  }
  async list(user: AuthenticatedUser, page: number): Promise<AdminMcpCommandPage> {
    const rows = await this.prisma.mcpAdminCommand.findMany({
      where: { delegation: { userId: mcpUserId(user) } },
      include: { delegation: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      skip: page * 20,
    });
    const items: AdminMcpCommand[] = [];
    for (const row of rows.slice(0, 20)) {
      let definition: ReturnType<AdminMcpGraphqlBridge['operation']> | undefined;
      try {
        definition = this.bridge.operation(row.operation);
      } catch {
        // A retained proposal can outlive the server's operation catalog.
      }
      let unavailableReason: string | null = !definition
        ? 'Esta operação não está mais disponível no catálogo.'
        : row.state !== 'PENDING'
          ? 'Esta proposta já foi decidida ou requer verificação do histórico.'
          : row.expiresAt <= new Date()
            ? 'Proposta expirada.'
            : null;
      if (!unavailableReason) {
        try {
          await this.grant(user, row.delegationId, row.operation, row.arguments as Record<string, unknown>, 'apply');
        } catch {
          unavailableReason = 'Sem delegação ou autorização atual para executar.';
        }
      }
      const targets =
        !unavailableReason && definition
          ? await this.targetLabels(
              definition.definition,
              row.arguments as Record<string, unknown>,
              row.delegation.personalData,
            )
          : [];
      items.push({
        targets,
        id: row.id,
        delegationId: row.delegationId,
        operation: row.operation,
        operationLabel: definition?.info.label ?? row.operation,
        domain: definition?.info.domain ?? 'indisponível',
        clientId: row.delegation.clientId,
        state: row.state as AdminMcpCommand['state'],
        arguments: row.arguments as Record<string, unknown>,
        inputSchema: definition?.info.inputSchema ?? {},
        effects: definition
          ? this.effects(row.operation)
          : 'Operação indisponível. Esta proposta não pode ser executada.',
        fingerprint: row.fingerprint,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        decidedAt: row.decidedAt?.toISOString() ?? null,
        approvedByName: row.approvedByName,
        canApprove: !unavailableReason,
        unavailableReason,
      });
    }
    return { items, hasMore: rows.length > 20 };
  }
  private async targetLabels(
    definition: import('./catalog').AdminMcpOperation,
    args: Record<string, unknown>,
    personalData: boolean,
  ) {
    const eventIds = new Set<string>();
    const eventGroupIds = new Set<string>();
    const majorEventIds = new Set<string>();
    for (const context of operationContexts(definition, args, this.policy)) {
      const resolved = await this.policy.resolveOperationTargets(definition.permissions, context);
      resolved.eventIds.forEach((id) => eventIds.add(id));
      resolved.eventGroupIds.forEach((id) => eventGroupIds.add(id));
      resolved.majorEventIds.forEach((id) => majorEventIds.add(id));
    }
    return commandTargetLabels(
      this.prisma,
      definition,
      { ...args, eventIds: [...eventIds], eventGroupIds: [...eventGroupIds], majorEventIds: [...majorEventIds] },
      personalData,
    );
  }
  async review(user: AuthenticatedUser, id: string, input: AdminMcpCommandReview): Promise<AdminMcpCommandPreview> {
    const command = await this.owned(user, id);
    if (
      command.state !== 'PENDING' ||
      command.expiresAt <= new Date() ||
      command.fingerprint !== input.expectedFingerprint
    )
      throw new ConflictException('Proposta alterada, decidida ou expirada.');
    const args = this.bridge.arguments(command.operation, input.arguments);
    preserveTargets(command.arguments, args);
    await this.grant(user, command.delegationId, command.operation, args, 'apply');
    if (
      (await this.fingerprint(command.operation, command.arguments as Record<string, unknown>)) !== command.fingerprint
    )
      throw new ConflictException('Os dados administrativos mudaram. Crie uma nova proposta.');
    const preview = {
      proposalId: id,
      operation: command.operation,
      arguments: args,
      expectedFingerprint: command.fingerprint,
      effects: await this.reviewEffects(command.operation, args),
    };
    return {
      ...preview,
      token: signMcpReview('admin-command', [mcpUserId(user), command.delegationId, preview], command.expiresAt),
    };
  }
  async decide(user: AuthenticatedUser, id: string, input: AdminMcpCommandDecision): Promise<AdminMcpCommandState> {
    const command = await this.owned(user, id);
    if (command.state !== 'PENDING' || command.fingerprint !== input.expectedFingerprint)
      throw new ConflictException('Proposta já decidida ou revisão alterada.');
    if (input.decision === 'REJECT') {
      await runSerializablePrismaTransaction(this.prisma, async (tx) => {
        const updated = await tx.mcpAdminCommand.updateMany({
          where: { id, state: 'PENDING' },
          data: { state: 'REJECTED', decidedAt: new Date() },
        });
        if (updated.count !== 1) throw new ConflictException('Proposta já decidida.');
        await this.queueAudit(tx, user, id, 'Operação administrativa MCP recusada.', { operation: command.operation });
      });
      await this.invalidations.publish(mcpUserId(user));
      return 'REJECTED';
    }
    if (!input.review || input.review.proposalId !== id || input.review.operation !== command.operation)
      throw new ConflictException('Confira a prévia final antes de aprovar.');
    const preview = await this.review(user, id, input.review);
    const payload = {
      proposalId: input.review.proposalId,
      operation: input.review.operation,
      arguments: input.review.arguments,
      expectedFingerprint: input.review.expectedFingerprint,
      effects: input.review.effects,
    };
    assertMcpReviewToken('admin-command', [mcpUserId(user), command.delegationId, payload], input.review.token);
    if (!isDeepStrictEqual(preview.arguments, input.review.arguments) || preview.effects !== input.review.effects)
      throw new ConflictException('Os valores normalizados mudaram.');
    const delegation = await this.grant(user, command.delegationId, command.operation, preview.arguments, 'apply');
    const person = await this.prisma.user.findUnique({ where: { id: mcpUserId(user) }, select: { name: true } });
    const approvedByName = person?.name ?? mcpUserId(user);
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      const active = await tx.mcpAdminOperationDelegation.findFirst({
        where: { id: delegation.id, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      if (!active) throw new ForbiddenException('Delegação expirada ou revogada.');
      const claimed = await tx.mcpAdminCommand.updateMany({
        where: { id, state: 'PENDING', expiresAt: { gt: new Date() } },
        data: {
          state: 'APPLYING',
          decidedAt: new Date(),
          approvedById: user.sub,
          approvedByName,
          reviewedArguments: json(preview.arguments),
        },
      });
      if (claimed.count !== 1) throw new ConflictException('Proposta já decidida ou expirada.');
      await this.queueAudit(tx, user, id, `Execução MCP aprovada por ${approvedByName}.`, {
        operation: command.operation,
        clientId: delegation.clientId,
        approvedById: user.sub,
        approvedByName,
        manuallyEdited: !isDeepStrictEqual(command.arguments, preview.arguments),
        reviewedFields: Object.keys(preview.arguments),
        discardedFields: Object.keys(command.arguments as object).filter((key) => !(key in preview.arguments)),
      });
    });
    let outcome: 'APPLIED' | 'UNCERTAIN' = 'APPLIED';
    try {
      const scope = parseMcpInput(adminScopeSchema, delegation.scope);
      await this.bridge.execute(command.operation, preview.arguments, user, {
        phase: 'apply',
        proposalId: id,
        delegationId: delegation.id,
        clientId: delegation.clientId,
        operation: command.operation,
        approvedByName,
        reviewMetadata: {
          manuallyEdited: !isDeepStrictEqual(command.arguments, preview.arguments),
          reviewedFields: Object.keys(preview.arguments),
        },
        beforeTransaction: async (tx) => {
          await lockCommandTargets(tx, this.bridge.operation(command.operation).definition, preview.arguments);
          if (
            (await this.fingerprint(command.operation, command.arguments as Record<string, unknown>, tx, id)) !==
            command.fingerprint
          )
            throw new ConflictException('Os dados mudaram antes da execução. Crie outra proposta.');
        },
        assertScope: (permissions, context) => this.scopes.assert(scope, permissions, context),
      });
      await this.finish(user, id, 'APPLIED', command.operation);
    } catch {
      // Never retry a potentially committed domain operation. Its own transaction
      // audit has proposalId; a person must inspect history after ambiguous failure.
      outcome = 'UNCERTAIN';
      await this.finish(user, id, 'UNCERTAIN', command.operation);
    }
    await this.invalidations.publish(mcpUserId(user));
    return outcome;
  }
  private async finish(user: AuthenticatedUser, id: string, state: 'APPLIED' | 'UNCERTAIN', operation: string) {
    await runSerializablePrismaTransaction(this.prisma, async (tx) => {
      await tx.mcpAdminCommand.updateMany({ where: { id, state: 'APPLYING' }, data: { state } });
      await this.queueAudit(
        tx,
        user,
        id,
        state === 'APPLIED'
          ? 'Operação MCP concluída.'
          : 'Resultado MCP incerto; confira o histórico antes de qualquer nova ação.',
        { operation, result: state },
      );
    });
  }
  private queueAudit(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    id: string,
    summary: string,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record(
      {
        entityType: AuditLogEntityType.SYSTEM,
        entityId: id,
        entityLabel: 'Operação administrativa MCP',
        operation: AuditLogOperation.UPDATE,
        actor: user,
        before: {},
        after: {},
        force: true,
        squashWindowMs: 0,
        summary,
        metadata: { ...metadata, source: 'mcp', queueOnly: true, proposalId: id },
      },
      tx,
    );
  }
}
