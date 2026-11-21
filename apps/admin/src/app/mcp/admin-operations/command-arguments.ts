import type { AdminMcpCommand } from '@cacic-fct/event-manager-mcp-contracts';
import { adminOperationArgumentLabel } from './admin-operation-labels';

export interface CommandArgument {
  key: string;
  label: string;
  schema: Record<string, unknown>;
  original: unknown;
  value: unknown;
  required: boolean;
  locked: boolean;
  included: boolean;
  children: CommandArgument[];
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function argumentSchema(value: unknown, root: Record<string, unknown>): Record<string, unknown> {
  const schema = record(value);
  if (typeof schema['$ref'] === 'string' && schema['$ref'].startsWith('#/')) {
    const resolved = schema['$ref']
      .slice(2)
      .split('/')
      .reduce<unknown>((node, key) => record(node)[key], root);
    return argumentSchema(resolved, root);
  }
  const alternatives = schema['anyOf'] ?? schema['oneOf'];
  if (Array.isArray(alternatives)) {
    const concrete = alternatives.find((entry: unknown) => record(entry)['type'] !== 'null');
    return { ...schema, ...argumentSchema(concrete, root) };
  }
  return schema;
}

export function buildCommandArguments(command: AdminMcpCommand): CommandArgument[] {
  function build(args: Record<string, unknown>, schema: Record<string, unknown>): CommandArgument[] {
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    return Object.entries(args).map(([key, value]) => {
      const info = argumentSchema(record(schema['properties'])[key], command.inputSchema);
      const children =
        value !== null && typeof value === 'object' && !Array.isArray(value) ? build(record(value), info) : [];
      const identifier = key === 'id' || /Ids?$/.test(key);
      // Review may narrow a list of destinations, but cannot replace a unique destination.
      const locked =
        (identifier && (!Array.isArray(value) || value.length <= 1)) || children.some((child) => child.locked);
      return {
        key,
        label: typeof info['title'] === 'string' ? info['title'] : adminOperationArgumentLabel(key),
        schema: info,
        original: structuredClone(value),
        value: structuredClone(value),
        required: required.includes(key),
        locked,
        included: true,
        children,
      };
    });
  }
  return build(command.arguments, command.inputSchema);
}

export function commandArguments(fields: CommandArgument[]): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => field.included)
      .map((field) => [field.key, field.children.length ? commandArguments(field.children) : field.value]),
  );
}

export function serializeArgument(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'Sem valor';
}

export function argumentDisplay(value: unknown, targets: AdminMcpCommand['targets'] = []): string {
  if (value === null || value === undefined) return 'Sem valor';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (Array.isArray(value)) return value.map((item) => argumentDisplay(item, targets)).join('\n') || 'Nenhum item';
  if (typeof value === 'string')
    return targets?.find((target) => target.id === value)?.label ?? (value || 'Texto vazio');
  return typeof value === 'object' ? serializeArgument(value) : String(value);
}
