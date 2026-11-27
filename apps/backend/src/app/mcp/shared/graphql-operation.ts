import { BadRequestException, HttpException } from '@nestjs/common';
import {
  execute,
  getNamedType,
  getVariableValues,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  parse,
  validate,
  type DocumentNode,
  type GraphQLField,
  type GraphQLInputType,
  type GraphQLSchema,
} from 'graphql';
import { z } from 'zod';
import { parseMcpOperationInput } from './schemas';

export interface PreparedMcpGraphqlOperation {
  field: string;
  document: DocumentNode;
  schema: z.ZodType;
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

// Definitions and selections come from a server-owned catalog.
export function prepareMcpGraphqlOperation(
  schema: GraphQLSchema,
  definition: { kind: 'query' | 'mutation'; field: string; selection?: string },
): PreparedMcpGraphqlOperation {
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
  return { field: definition.field, document, schema: inputs };
}

export function parseMcpGraphqlArguments(
  schema: GraphQLSchema,
  operation: PreparedMcpGraphqlOperation,
  input: unknown,
): Record<string, unknown> {
  const parsed = parseMcpOperationInput(input, operation.schema, 64000, boundedJson);
  const variables = getVariableValues(
    schema,
    operation.document.definitions.flatMap((item) =>
      item.kind === 'OperationDefinition' ? (item.variableDefinitions ?? []) : [],
    ),
    parsed,
  );
  if (variables.errors) {
    throw new BadRequestException('Argumentos incompatíveis com a operação.');
  }
  // Preserve wire values for reviews. GraphQL coerces scalars again on execution.
  return JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
}

// The caller establishes its own trusted request context and authorizes the operation.
export async function executeMcpGraphqlOperation(
  schema: GraphQLSchema,
  operation: PreparedMcpGraphqlOperation,
  values: Record<string, unknown>,
  contextValue: object,
): Promise<unknown> {
  const result = await execute({
    schema,
    document: operation.document,
    variableValues: values,
    contextValue,
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
  const output = result.data?.[operation.field] ?? null;
  if (Buffer.byteLength(JSON.stringify(output)) > 512000) {
    throw new BadRequestException('Resultado excessivo. Reduza a página ou consulte um recurso específico.');
  }
  return output;
}
