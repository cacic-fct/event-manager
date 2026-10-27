import { Type, type Static } from '@sinclair/typebox';
import {
  EventResourceSchema,
  GroupResourceSchema,
  MajorEventResourceSchema,
  PlaceResourceSchema,
  PriceResourceSchema,
  PriceTierResourceSchema,
} from './event-schema';
import {
  CertificateConfigResourceSchema,
  FormLinkResourceSchema,
  FormResourceSchema,
  TicketConfigResourceSchema,
  TicketPriceOptionResourceSchema,
} from './configuration-schema';
import {
  CategoryResourceSchema,
  MatchResourceSchema,
  StageResourceSchema,
  TournamentResourceSchema,
  VenueResourceSchema,
} from './sports-schema';
import { TRANSFER_FORMAT, TRANSFER_MAX_RESOURCES, TRANSFER_SCHEMA_ID, TRANSFER_VERSION } from './schema-helpers';
import {
  AttendanceResourceSchema,
  EventSubscriptionResourceSchema,
  GroupSubscriptionResourceSchema,
  MajorSubscriptionResourceSchema,
  TicketPurchaseResourceSchema,
  EventTicketResourceSchema,
} from './participation-schema';
import type { AssertContract, EqualContract, ResourceContractKind } from './schema-contracts';

export * from './schema-contracts';

export * from './schema-helpers';

export const TRANSFER_RESOURCE_SCHEMAS = {
  'major-event': MajorEventResourceSchema,
  group: GroupResourceSchema,
  event: EventResourceSchema,
  'major-event-price': PriceResourceSchema,
  'price-tier': PriceTierResourceSchema,
  'place-preset': PlaceResourceSchema,
  'event-form': FormResourceSchema,
  'form-link': FormLinkResourceSchema,
  'certificate-config': CertificateConfigResourceSchema,
  'ticket-config': TicketConfigResourceSchema,
  'ticket-price-option': TicketPriceOptionResourceSchema,
  'ticket-purchase': TicketPurchaseResourceSchema,
  'event-ticket': EventTicketResourceSchema,
  'sports-tournament': TournamentResourceSchema,
  'sports-category': CategoryResourceSchema,
  'sports-venue': VenueResourceSchema,
  'sports-stage': StageResourceSchema,
  'sports-match': MatchResourceSchema,
  'event-subscription': EventSubscriptionResourceSchema,
  'group-subscription': GroupSubscriptionResourceSchema,
  'major-event-subscription': MajorSubscriptionResourceSchema,
  'event-attendance': AttendanceResourceSchema,
} as const;

export const TransferResourceSchema = Type.Union([
  MajorEventResourceSchema,
  GroupResourceSchema,
  EventResourceSchema,
  PriceResourceSchema,
  PriceTierResourceSchema,
  PlaceResourceSchema,
  FormResourceSchema,
  FormLinkResourceSchema,
  CertificateConfigResourceSchema,
  TicketConfigResourceSchema,
  TicketPriceOptionResourceSchema,
  TournamentResourceSchema,
  CategoryResourceSchema,
  VenueResourceSchema,
  StageResourceSchema,
  MatchResourceSchema,
  EventSubscriptionResourceSchema,
  GroupSubscriptionResourceSchema,
  MajorSubscriptionResourceSchema,
  AttendanceResourceSchema,
  TicketPurchaseResourceSchema,
  EventTicketResourceSchema,
]);

export const TransferDocumentSchema = Type.Object(
  {
    $schema: Type.Optional(Type.Literal(TRANSFER_SCHEMA_ID)),
    format: Type.Literal(TRANSFER_FORMAT),
    version: Type.Literal(TRANSFER_VERSION),
    resources: Type.Array(TransferResourceSchema, { minItems: 1, maxItems: TRANSFER_MAX_RESOURCES }),
  },
  {
    additionalProperties: false,
    $id: TRANSFER_SCHEMA_ID,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'CACiC — configuração de eventos e esportes',
    description:
      'IDs são estáveis. Campos omitidos preservam valores. Registros ausentes nunca são excluídos. A autorização é verificada no servidor.',
  },
);

export type TransferDocument = Static<typeof TransferDocumentSchema>;
export type TransferFileResource = Static<typeof TransferResourceSchema>;
/** Only the backend's key resolver supplies IDs for key-only file records. */
type WithResolvedId<R> = R extends { kind: string } ? Omit<R, 'id'> & { id: string } : never;
export type TransferResource = WithResolvedId<TransferFileResource>;
type ResolveDocument<Document> = Document extends TransferDocument
  ? Omit<Document, 'resources'> & { resources: TransferResource[] }
  : never;
export type ResolvedTransferDocument = ResolveDocument<TransferDocument>;
export type TransferResourceKind = TransferResource['kind'];
export type ResourceOfKind<K extends TransferResourceKind> = Extract<TransferResource, { kind: K }>;

type _SchemaMapUsesEveryOwnerKind = AssertContract<
  EqualContract<keyof typeof TRANSFER_RESOURCE_SCHEMAS, ResourceContractKind>
>;
type _SchemaUnionUsesEveryOwnerKind = AssertContract<
  EqualContract<Static<typeof TransferResourceSchema>['kind'], ResourceContractKind>
>;
export type TransferSchemaCompleteness = _SchemaMapUsesEveryOwnerKind | _SchemaUnionUsesEveryOwnerKind;
