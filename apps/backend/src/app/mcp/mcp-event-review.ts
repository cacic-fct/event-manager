import {
  MCP_EVENT_REVIEW_FIELDS,
  type McpEventReviewFieldValue,
  type McpEventReviewSelection,
  type McpProposalOperation,
} from '@cacic-fct/event-manager-mcp-contracts';
import { BadRequestException } from '@nestjs/common';
import {
  currentMcpValues,
  mcpChangeFieldLabel,
  normalizedMcpChange,
  type McpChangeEvent,
  type McpChangeValues,
} from './mcp-admin-change-policy';

type Patch = { before: McpChangeValues; after: McpChangeValues };

const virtualResets = new Set<string>(['locationName', 'locationDescription', 'latitude', 'longitude']);

export function mcpEventReviewFields(original: Patch): McpEventReviewFieldValue[] {
  const virtual = original.after['isVirtual'] === true;
  const fields = MCP_EVENT_REVIEW_FIELDS.filter((field) => {
    if (virtual && virtualResets.has(field)) return false;
    if (virtual && field === 'isVirtual') return true;
    return original.before[field] !== original.after[field];
  });
  return fields.map((field) => ({
    field,
    label: mcpChangeFieldLabel(field),
    proposedValue: original.after[field],
  }));
}

export function prepareMcpEventReview(
  operation: McpProposalOperation,
  original: Patch,
  event: McpChangeEvent,
  selections: readonly McpEventReviewSelection[],
) {
  if (!selections.length) throw new BadRequestException('Selecione ao menos uma alteração para aprovar.');
  const editable = new Set(mcpEventReviewFields(original).map(({ field }) => field));
  if (
    selections.some(({ field }) => !editable.has(field)) ||
    new Set(selections.map(({ field }) => field)).size !== selections.length
  ) {
    throw new BadRequestException('Escolha somente campos editáveis da proposta original.');
  }

  const selectedValues = Object.fromEntries(
    selections.map(({ field, value }) => [field, value === undefined ? original.after[field] : value]),
  );
  if (selectedValues['isVirtual'] === true && [...virtualResets].some((field) => selectedValues[field] != null)) {
    throw new BadRequestException('Um evento virtual não pode manter informações de local físico.');
  }
  const normalized = normalizedMcpChange(operation, selectedValues, event);
  const current = currentMcpValues(event, Object.keys(normalized));
  const appliedFields = Object.keys(normalized).filter((field) => current[field] !== normalized[field]);
  if (
    appliedFields.some(
      (field) => !Object.hasOwn(original.after, field) || original.before[field] === original.after[field],
    )
  ) {
    throw new BadRequestException('Esta seleção depende de alterar campos fora da proposta original.');
  }
  if (!appliedFields.length) throw new BadRequestException('A seleção não modifica os valores atuais.');

  const after = Object.fromEntries(appliedFields.map((field) => [field, normalized[field]]));
  const selectedFields = selections.map(({ field }) => field).sort();
  const discardedFields = Object.keys(original.after)
    .filter((field) => original.before[field] !== original.after[field] && !Object.hasOwn(after, field))
    .sort();
  const editedFields = selectedFields.filter((field) => original.after[field] !== normalized[field]);
  return {
    before: currentMcpValues(event, appliedFields),
    after,
    selectedFields,
    discardedFields,
    editedFields,
  };
}

export function mcpReviewValueEntries(values: McpChangeValues): [string, McpChangeValues[string]][] {
  return Object.entries(values).sort(([left], [right]) => left.localeCompare(right, 'en'));
}
