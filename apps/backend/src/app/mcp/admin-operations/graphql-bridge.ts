import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import type { GraphQLSchema } from 'graphql';
import { z } from 'zod';
import type { AdminMcpOperationInfo } from '@cacic-fct/event-manager-mcp-contracts';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  executeMcpGraphqlOperation,
  parseMcpGraphqlArguments,
  prepareMcpGraphqlOperation,
  type PreparedMcpGraphqlOperation,
} from '../shared/graphql-operation';
import { withoutMcpBearer } from '../shared/principal';
import { parseMcpOperationInput } from '../shared/schemas';
import { McpAdminConfig } from '../mcp-admin.config';
import { ADMIN_MCP_OPERATIONS, type AdminMcpOperation } from './catalog';
import { adminMcpExecution, type AdminMcpExecution } from './execution-context';
import {
  AdminMcpRestOperations,
  type AdminMcpRestOperationContext,
  type PreparedAdminRestOperation,
} from './rest-operations';

export interface PreparedAdminOperation {
  definition: AdminMcpOperation;
  schema: z.ZodType;
  graphql?: PreparedMcpGraphqlOperation;
  rest?: PreparedAdminRestOperation;
  info: AdminMcpOperationInfo;
}

export function adminToolName(operation: Pick<AdminMcpOperation, 'kind' | 'field'>): string {
  return `${operation.kind === 'mutation' ? 'propose_admin' : 'admin'}_${operation.field}`;
}

function humanLabel(field: string): string {
  const verbs: Record<string, string> = {
    create: 'Criar',
    update: 'Editar',
    delete: 'Excluir',
    save: 'Salvar',
    list: 'Listar',
    get: 'Consultar',
    admin: 'Consultar',
    publish: 'Publicar',
    unpublish: 'Despublicar',
    review: 'Revisar',
    finish: 'Encerrar',
    reopen: 'Reabrir',
    generate: 'Gerar',
    assign: 'Atribuir',
    revoke: 'Revogar',
    approve: 'Aprovar',
    reject: 'Rejeitar',
    duplicate: 'Duplicar',
    block: 'Bloquear',
    decide: 'Decidir',
    set: 'Definir',
    run: 'Executar',
    add: 'Adicionar',
    remove: 'Remover',
    cancel: 'Cancelar',
    issue: 'Emitir',
    merge: 'Mesclar',
    revert: 'Reverter',
    clone: 'Clonar',
    convert: 'Converter',
    freeze: 'Congelar',
    unfreeze: 'Descongelar',
    spin: 'Sortear',
    undo: 'Desfazer',
    commit: 'Confirmar',
    upsert: 'Salvar',
    archive: 'Arquivar',
    correct: 'Corrigir',
    apply: 'Aplicar',
    import: 'Importar',
  };
  const nouns: Record<string, string> = {
    sports: 'esportivo',
    tournament: 'torneio',
    category: 'modalidade',
    team: 'equipe',
    member: 'integrante',
    match: 'partida',
    venue: 'local',
    official: 'árbitro',
    registration: 'inscrição',
    event: 'evento',
    group: 'grupo',
    major: 'grande',
    person: 'pessoa',
    people: 'pessoas',
    permission: 'permissão',
    role: 'cargo',
    form: 'formulário',
    ticket: 'bilhete',
    certificate: 'certificado',
    material: 'material',
    score: 'pontuação',
    roster: 'súmula',
    action: 'ocorrência',
    bracket: 'chaveamento',
    publication: 'publicação',
    collector: 'coletor',
    attendance: 'presença',
    subscription: 'inscrição',
    receipt: 'comprovante',
    draw: 'sorteio',
  };
  const phrases: Record<string, string> = {
    SportsTournamentScoreEntry: 'pontuação do torneio',
    SportsOfficialAssignment: 'escala de arbitragem',
    SportsPlayerApplication: 'candidatura de atleta',
    SportsTeamChange: 'alteração de equipe',
    SportsMatchRoster: 'súmula esportiva',
    SportsMatchAction: 'ocorrência esportiva',
    SportsTeamMember: 'integrante de equipe',
    SportsTournament: 'torneio esportivo',
    SportsCategory: 'modalidade esportiva',
    SportsRegistration: 'inscrição esportiva',
    SportsOfficial: 'árbitro esportivo',
    SportsVenue: 'local esportivo',
    SportsMatch: 'partida esportiva',
    SportsTeam: 'equipe esportiva',
    EventAttendanceCollector: 'coletor de presença',
    EventForm: 'formulário',
    EventGroup: 'grupo de eventos',
    MajorEvent: 'grande evento',
    TicketPurchase: 'compra de bilhete',
    TicketConfig: 'configuração de bilhetes',
    PermissionRole: 'cargo de acesso',
    PermissionGroup: 'grupo de permissões',
    ContentReview: 'revisão de conteúdo',
    AuditLogEntry: 'registro de auditoria',
    PlacePreset: 'local cadastrado',
    LecturerProfile: 'perfil de palestrante',
    EventAttendance: 'presença',
    EventSubscription: 'inscrição no evento',
    EventMaterials: 'materiais do evento',
    PrizeDraw: 'sorteio',
  };
  let title = field;
  for (const [name, translated] of Object.entries(phrases)) {
    title = title.replaceAll(name, ` ${translated} `);
  }
  const words = title
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/);
  const first = words[0].toLowerCase();
  const verb = verbs[first];
  const translated = words
    .map((word, index) => (index === 0 && verb ? verb : (nouns[word.toLowerCase()] ?? word.toLowerCase())))
    .join(' ');
  return verb ? translated : `Consultar ${translated}`;
}

@Injectable()
export class AdminMcpGraphqlBridge {
  private loadedSchema?: GraphQLSchema;
  private readonly prepared = new Map<string, PreparedAdminOperation>();
  private failures: { field: string; reason: string }[] = [];

  constructor(
    private readonly host: GraphQLSchemaHost,
    private readonly config: McpAdminConfig,
    @Optional() private readonly restOperations?: AdminMcpRestOperations,
  ) {}

  private load(): void {
    const schema = this.host.schema;
    if (schema === this.loadedSchema) {
      return;
    }
    this.prepared.clear();
    this.failures = [];
    for (const definition of ADMIN_MCP_OPERATIONS) {
      try {
        if (definition.transport === 'REST') {
          if (!this.restOperations) throw new Error('Adaptador REST administrativo indisponível.');
          const prepared = this.restOperations.prepare(definition);
          this.prepared.set(definition.field, {
            definition,
            schema: prepared.operation.schema,
            rest: prepared.operation,
            info: prepared.info,
          });
          continue;
        }
        if (this.restOperations?.operation(definition.field)) {
          throw new Error('Operação REST não classificada no catálogo.');
        }
        const graphql = prepareMcpGraphqlOperation(schema, definition);
        const info: AdminMcpOperationInfo = {
          field: definition.field,
          kind: definition.kind,
          domain: definition.domain,
          personalData: definition.personalData,
          requiresAllAuthorized: definition.target === 'GLOBAL' || definition.target.mode !== 'ARGUMENTS',
          tool: adminToolName(definition),
          label: humanLabel(definition.field),
          description: definition.description,
          inputSchema: z.toJSONSchema(graphql.schema, { io: 'input', unrepresentable: 'any' }) as Record<
            string,
            unknown
          >,
        };
        this.prepared.set(definition.field, { definition, graphql, schema: graphql.schema, info });
      } catch (error) {
        this.failures.push({
          field: definition.field,
          reason: error instanceof Error ? error.message : 'Operação indisponível.',
        });
      }
    }
    this.loadedSchema = schema;
  }

  catalog(): AdminMcpOperationInfo[] {
    this.load();
    return [...this.prepared.values()].map((item) => item.info);
  }

  coverage() {
    this.load();
    return {
      candidates: ADMIN_MCP_OPERATIONS.length,
      available: this.prepared.size,
      unavailable: this.failures,
    };
  }

  operation(field: string): PreparedAdminOperation {
    this.load();
    const operation = this.prepared.get(field);
    if (!operation) {
      throw new BadRequestException('Operação administrativa indisponível.');
    }
    return operation;
  }

  arguments(field: string, input: unknown): Record<string, unknown> {
    const operation = this.operation(field);
    if (operation.rest) {
      const parsed = parseMcpOperationInput(input, operation.schema, operation.rest.maxInputBytes ?? 64000);
      return JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    }
    if (!operation.graphql) throw new BadRequestException('Operação administrativa indisponível.');
    return parseMcpGraphqlArguments(this.host.schema, operation.graphql, input);
  }

  async execute(
    field: string,
    values: Record<string, unknown>,
    user: AuthenticatedUser,
    execution: Omit<AdminMcpExecution, 'request' | 'user'>,
  ): Promise<unknown> {
    const operation = this.operation(field);
    if ((operation.definition.kind === 'query') !== (execution.phase === 'read')) {
      throw new BadRequestException('Fase incompatível com a operação.');
    }
    const canonical = this.arguments(field, values);
    const headers = { host: new URL(this.config.resourceUrl).host };
    const safeUser = withoutMcpBearer(user);
    const request = {
      user: safeUser,
      headers,
      cookies: {},
      method: 'POST',
      ip: `mcp:${user.sub}`,
      socket: { remoteAddress: '127.0.0.1' },
      body: {},
      get: (name: string) => (name.toLowerCase() === 'host' ? headers.host : undefined),
    };
    const response = { setHeader: () => undefined, header: () => undefined, locals: {} };
    return adminMcpExecution.run({ ...execution, request, user: safeUser }, async () => {
      if (operation.rest) {
        return this.restOperations?.execute(field, canonical, safeUser, restContext(field, execution));
      }
      if (!operation.graphql) throw new BadRequestException('Operação administrativa indisponível.');
      return executeMcpGraphqlOperation(this.host.schema, operation.graphql, canonical, {
        req: request,
        request,
        res: response,
      });
    });
  }

  async preflight(
    field: string,
    input: unknown,
    user: AuthenticatedUser,
    context: Pick<AdminMcpExecution, 'delegationId' | 'clientId' | 'proposalId'>,
  ): Promise<void> {
    const operation = this.operation(field);
    if (operation.definition.kind !== 'mutation') throw new BadRequestException('Esta operação só consulta.');
    if (!operation.rest) return;
    const canonical = this.arguments(field, input);
    await this.restOperations?.preflight(field, canonical, user, { ...context, operation: field });
  }
}

function restContext(
  operation: string,
  execution: Omit<AdminMcpExecution, 'request' | 'user'>,
): AdminMcpRestOperationContext {
  return {
    delegationId: execution.delegationId,
    clientId: execution.clientId,
    operation,
    ...(execution.proposalId ? { proposalId: execution.proposalId } : {}),
  };
}
