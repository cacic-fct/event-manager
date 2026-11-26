import { BadRequestException, HttpException, Injectable, Optional } from '@nestjs/common';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import {
  execute,
  getNamedType,
  getVariableValues,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  isInterfaceType,
  parse,
  validate,
  type GraphQLInputType,
  type GraphQLSchema,
  type GraphQLField,
} from 'graphql';
import { z } from 'zod';
import type { AdminMcpOperationInfo } from '@cacic-fct/event-manager-mcp-contracts';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
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
  document?: ReturnType<typeof parse>;
  rest?: PreparedAdminRestOperation;
  info: AdminMcpOperationInfo;
}

export function adminToolName(operation: Pick<AdminMcpOperation, 'kind' | 'field'>): string {
  return `${operation.kind === 'mutation' ? 'propose_admin' : 'admin'}_${operation.field}`;
}

const jsonValue = z.unknown().superRefine((value, context) => {
  if (!boundedJson(value)) {
    context.addIssue({ code: 'custom', message: 'JSON inválido ou excessivo.' });
  }
});

export function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 12) {
    return false;
  }
  if (value === null || ['string', 'boolean'].includes(typeof value)) {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 200 && value.every((item) => boundedJson(item, depth + 1));
  }
  if (typeof value !== 'object') {
    return false;
  }
  return (
    Object.entries(value).length <= 200 &&
    Object.entries(value).every(
      ([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && boundedJson(item, depth + 1),
    )
  );
}

function inputSchema(type: GraphQLInputType, cache: Map<string, z.ZodType>): z.ZodType {
  if (!isNonNullType(type)) {
    return nonNullableSchema(type, cache).nullable().optional();
  }
  return nonNullableSchema(type.ofType, cache);
}

function nonNullableSchema(type: GraphQLInputType, cache: Map<string, z.ZodType>): z.ZodType {
  if (isNonNullType(type)) {
    return nonNullableSchema(type.ofType, cache);
  }
  if (isListType(type)) {
    return z.array(inputSchema(type.ofType, cache)).max(200);
  }
  if (isEnumType(type)) {
    return z.enum(type.getValues().map((value) => value.name) as [string, ...string[]]);
  }
  if (isInputObjectType(type)) {
    const prior = cache.get(type.name);
    if (prior) {
      return prior;
    }
    const lazy = z.lazy(() =>
      z.strictObject(
        Object.fromEntries(
          Object.entries(type.getFields()).map(([name, field]) => [
            name,
            field.defaultValue === undefined
              ? inputSchema(field.type, cache)
              : inputSchema(field.type, cache).default(JSON.parse(JSON.stringify(field.defaultValue))),
          ]),
        ),
      ),
    );
    cache.set(type.name, lazy);
    return lazy;
  }
  switch (getNamedType(type).name) {
    case 'Boolean':
      return z.boolean();
    case 'Int':
      return z.number().int().min(-2147483648).max(2147483647);
    case 'Float':
      return z.number();
    case 'ID':
      return z.string().min(1).max(200);
    case 'DateTime':
    case 'Date':
      return z.iso.datetime({ offset: true });
    case 'Timestamp':
      return z.number().int();
    case 'String':
      return z.string().max(50000);
    case 'JSON':
    case 'JSONObject':
    case 'JSONString':
      return jsonValue;
    default:
      throw new Error('Unsupported input scalar.');
  }
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
        const root = definition.kind === 'query' ? schema.getQueryType() : schema.getMutationType();
        const field: GraphQLField<unknown, unknown> | undefined = root?.getFields()[definition.field];
        if (!field) {
          throw new Error('Operação ausente no schema.');
        }
        const named = getNamedType(field.type);
        if (!isObjectType(named) && !isInterfaceType(named) && /JSON|Upload|Buffer|File|Stream/i.test(named.name)) {
          throw new Error('Saída opaca indisponível.');
        }
        const variables = field.args.map((arg) => `$${arg.name}: ${arg.type}`).join(', ');
        const args = field.args.map((arg) => `${arg.name}: $${arg.name}`).join(', ');
        const selection = definition.selection ? `{ ${definition.selection} }` : '';
        const document = parse(
          `${definition.kind} McpOperation${variables ? `(${variables})` : ''} { ${definition.field}${args ? `(${args})` : ''} ${selection} }`,
        );
        if (validate(schema, document).length) {
          throw new Error('Projeção não corresponde ao schema.');
        }
        const cache = new Map<string, z.ZodType>();
        const shape = Object.fromEntries(
          field.args.map((arg) => [
            arg.name,
            arg.defaultValue === undefined
              ? inputSchema(arg.type, cache)
              : inputSchema(arg.type, cache).default(JSON.parse(JSON.stringify(arg.defaultValue))),
          ]),
        );
        const inputs = z.strictObject(shape);
        const info: AdminMcpOperationInfo = {
          field: definition.field,
          kind: definition.kind,
          domain: definition.domain,
          personalData: definition.personalData,
          requiresAllAuthorized: definition.target === 'GLOBAL' || definition.target.mode !== 'ARGUMENTS',
          tool: adminToolName(definition),
          label: humanLabel(definition.field),
          description: definition.description,
          inputSchema: z.toJSONSchema(inputs, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>,
        };
        this.prepared.set(definition.field, { definition, document, schema: inputs, info });
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
    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(input);
    } catch {
      throw new BadRequestException('Argumentos inválidos ou excessivos.');
    }
    if (
      serialized === undefined ||
      Buffer.byteLength(serialized) > (operation.rest?.maxInputBytes ?? 64000) ||
      (!operation.rest && !boundedJson(input))
    ) {
      throw new BadRequestException('Argumentos inválidos ou excessivos.');
    }
    const parsed = operation.schema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException('Confira os argumentos da operação.');
    }
    if (operation.rest) {
      return JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
    }
    if (!operation.document) throw new BadRequestException('Operação administrativa indisponível.');
    const variables = getVariableValues(
      this.host.schema,
      operation.document.definitions.flatMap((item) =>
        item.kind === 'OperationDefinition' ? (item.variableDefinitions ?? []) : [],
      ),
      parsed.data as Record<string, unknown>,
    );
    if (variables.errors) {
      throw new BadRequestException('Argumentos incompatíveis com a operação.');
    }
    // Keep JSON values canonical; GraphQL performs scalar coercion again on execution.
    return JSON.parse(JSON.stringify(parsed.data)) as Record<string, unknown>;
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
    const safeUser: AuthenticatedUser = { ...user, token: '', authenticationTransport: 'mcp' };
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
      if (!operation.document) throw new BadRequestException('Operação administrativa indisponível.');
      const result = await execute({
        schema: this.host.schema,
        document: operation.document,
        variableValues: canonical,
        contextValue: { req: request, request, res: response },
      });
      if (result.errors?.length) {
        const error = result.errors[0];
        const original = error.originalError;
        if (original instanceof HttpException && original.getStatus() < 500) {
          throw new BadRequestException(error.message);
        }
        throw new BadRequestException(
          'O serviço responsável recusou a operação. Confira permissões, revisão e elegibilidade.',
        );
      }
      const output = result.data?.[field] ?? null;
      if (Buffer.byteLength(JSON.stringify(output)) > 512000) {
        throw new BadRequestException('Resultado excessivo. Reduza a página ou consulte um recurso específico.');
      }
      return output;
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
