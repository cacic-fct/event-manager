import type {
  McpAdminCapability,
  McpProposalOperation,
  McpProposalChange,
} from '@cacic-fct/event-manager-mcp-contracts';
import { normalizeInformation } from '../events/event-preparation-text';
import { normalizeTwitchChannel, normalizeYoutubeCode } from '@cacic-fct/shared-livestream';
import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { assertEventLocation, normalizeEventLocation } from '../events/event-location';
import { mcpEventToolSchema } from './mcp-admin.schemas';
import { parseMcpInput } from './shared/schemas';

const text = (max: number) => z.string().trim().max(max).nullable().optional();
const nonempty = (value: object) => Object.keys(value).length > 0;
export const mcpContentChanges = z
  .strictObject({
    name: z.string().trim().min(1).max(250).optional(),
    description: text(20000),
    shortDescription: text(2000),
  })
  .refine(nonempty);
export const mcpLocationChanges = z
  .strictObject({
    locationName: text(250),
    locationDescription: text(2000),
    isVirtual: z.boolean().optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine(nonempty);
export const mcpPreparationChanges = z
  .strictObject({ lecturerInformation: text(10000), collectorInformation: text(10000) })
  .refine(nonempty);
export const mcpLivestreamChanges = z
  .strictObject({ youtubeCode: text(500), twitchChannel: text(500) })
  .refine(nonempty);
export const mcpChangeEnvelope = mcpEventToolSchema.extend({
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  idempotencyKey: z.string().uuid(),
});
export const mcpContentProposalSchema = mcpChangeEnvelope.extend({ changes: mcpContentChanges });
export const mcpLocationProposalSchema = mcpChangeEnvelope.extend({ changes: mcpLocationChanges });
export const mcpPreparationProposalSchema = mcpChangeEnvelope.extend({ changes: mcpPreparationChanges });
export const mcpLivestreamProposalSchema = mcpChangeEnvelope.extend({ changes: mcpLivestreamChanges });
export type McpChangeInput = z.infer<typeof mcpChangeEnvelope> & { changes: unknown };
export type McpChangeValues = Record<string, string | number | boolean | null>;
export const MCP_CHANGE_EVENT_SELECT = {
  id: true,
  name: true,
  description: true,
  shortDescription: true,
  createdAt: true,
  updatedAt: true,
  startDate: true,
  endDate: true,
  majorEventId: true,
  eventGroupId: true,
  publicationState: true,
  locationName: true,
  locationDescription: true,
  isVirtual: true,
  latitude: true,
  longitude: true,
  lecturerInformation: true,
  collectorInformation: true,
  preparationUpdatedAt: true,
  youtubeCode: true,
  twitchChannel: true,
} satisfies Prisma.EventSelect;
export type McpChangeEvent = Prisma.EventGetPayload<{ select: typeof MCP_CHANGE_EVENT_SELECT }>;

export const MCP_CHANGE_CAPABILITY = {
  EVENT_DESCRIPTION: 'DESCRIPTION_PROPOSE',
  EVENT_CONTENT: 'EVENT_CONTENT_PROPOSE',
  EVENT_LOCATION: 'LOCATION_PROPOSE',
  EVENT_PREPARATION: 'PREPARATION_PROPOSE',
  EVENT_LIVESTREAM: 'LIVESTREAM_PROPOSE',
} as const satisfies Record<McpProposalOperation, McpAdminCapability>;
export const MCP_OPERATION_LABEL = {
  EVENT_DESCRIPTION: 'Descrição',
  EVENT_CONTENT: 'Conteúdo do evento',
  EVENT_LOCATION: 'Local do evento',
  EVENT_PREPARATION: 'Orientações de preparação',
  EVENT_LIVESTREAM: 'Transmissão ao vivo',
} satisfies Record<McpProposalOperation, string>;
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  description: 'Descrição',
  shortDescription: 'Descrição curta',
  locationName: 'Nome do local',
  locationDescription: 'Descrição do local',
  isVirtual: 'Evento virtual',
  latitude: 'Latitude',
  longitude: 'Longitude',
  lecturerInformation: 'Orientações para palestrantes',
  collectorInformation: 'Orientações para coletores',
  youtubeCode: 'Vídeo do YouTube',
  twitchChannel: 'Canal da Twitch',
};

export function mcpChangeFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function normalizedMcpChange(
  operation: McpProposalOperation,
  input: unknown,
  current?: McpChangeEvent,
): McpChangeValues {
  let values: McpChangeValues;
  switch (operation) {
    case 'EVENT_DESCRIPTION':
      values = parseMcpInput(z.strictObject({ description: z.string().trim().min(1).max(20000) }), input);
      break;
    case 'EVENT_CONTENT':
      values = parseMcpInput(mcpContentChanges, input);
      break;
    case 'EVENT_LOCATION': {
      values = normalizeEventLocation(parseMcpInput(mcpLocationChanges, input));
      // Stored proposals may be displayed after the event changes. Check the
      // complete location only when proposing or applying a patch.
      if (!current) break;
      assertEventLocation(values, current);
      const location = { ...current, ...values };
      if (
        location.isVirtual &&
        (location.locationName != null ||
          location.locationDescription != null ||
          location.latitude != null ||
          location.longitude != null)
      ) {
        throw new BadRequestException('Um evento virtual não pode manter informações de local físico.');
      }
      if ((location.latitude == null) !== (location.longitude == null)) {
        throw new BadRequestException('Informe latitude e longitude juntas.');
      }
      break;
    }
    case 'EVENT_PREPARATION': {
      const parsed = parseMcpInput(mcpPreparationChanges, input);
      values = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, normalizeInformation(value)]));
      break;
    }
    case 'EVENT_LIVESTREAM': {
      const parsed = parseMcpInput(mcpLivestreamChanges, input);
      values = {};
      for (const [key, value] of Object.entries(parsed)) {
        const normalized = key === 'youtubeCode' ? normalizeYoutubeCode(value) : normalizeTwitchChannel(value);
        if (value && !normalized) {
          throw new BadRequestException('Informe uma transmissão válida.');
        }
        values[key] = normalized;
      }
      break;
    }
  }
  return values;
}

export function currentMcpValues(event: McpChangeEvent, keys: readonly string[]): McpChangeValues {
  return Object.fromEntries(
    keys.map((key) => {
      const value: unknown = Reflect.get(event, key);
      if (
        value !== undefined &&
        value !== null &&
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean'
      ) {
        throw new BadRequestException('Campo MCP inválido.');
      }
      return [key, value ?? null] as const;
    }),
  );
}

export function mcpValuesEqual(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

export function mcpFieldChanges(before: McpChangeValues, after: McpChangeValues): McpProposalChange[] {
  const display = (value: McpChangeValues[string]) => {
    if (value === null) return null;
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    return String(value);
  };
  return Object.keys(after)
    .filter((key) => !mcpValuesEqual(before[key], after[key]))
    .map((key) => ({
      field: key,
      label: mcpChangeFieldLabel(key),
      before: display(before[key]),
      after: display(after[key]),
    }));
}
