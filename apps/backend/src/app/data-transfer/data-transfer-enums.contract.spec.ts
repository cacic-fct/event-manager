import {
  AttendanceEligibility,
  CertificateIssuedTo,
  CertificateScope,
  ContactType,
  EventAttendanceStatus,
  EventAudience,
  EventFormAudience,
  EventFormResponseMode,
  EventFormSigilo,
  EventFormTargetType,
  EventType,
  EventTicketIssueSource,
  EventTicketStatus,
  PriceType,
  PublicationState,
  SportsAthleteIdentifierMode,
  SportsFormat,
  SportsLivestreamProvider,
  SportsPreset,
  SportsScoringMode,
  SportsStageType,
  SubscriptionStatus,
  TicketExpirationMode,
  TicketSubscriptionRequirement,
} from '@prisma/client';
import type { TObject, TSchema } from '@sinclair/typebox';
import { TRANSFER_RESOURCE_SCHEMAS } from '@cacic-fct/shared-data-transfer';

type TransferEnumField = {
  kind: keyof typeof TRANSFER_RESOURCE_SCHEMAS;
  field: string;
  generatedEnum: Record<string, string>;
  omittedValues?: readonly string[];
  arrayItem?: boolean;
};

const transferEnumFields: TransferEnumField[] = [
  { kind: 'event', field: 'publicationState', generatedEnum: PublicationState },
  { kind: 'major-event', field: 'publicationState', generatedEnum: PublicationState },
  { kind: 'event', field: 'type', generatedEnum: EventType },
  { kind: 'event-ticket', field: 'source', generatedEnum: EventTicketIssueSource },
  { kind: 'event-ticket', field: 'status', generatedEnum: EventTicketStatus },
  { kind: 'event', field: 'audience', generatedEnum: EventAudience },
  { kind: 'event', field: 'attendanceEligibility', generatedEnum: AttendanceEligibility },
  { kind: 'group', field: 'audience', generatedEnum: EventAudience },
  { kind: 'group', field: 'attendanceEligibility', generatedEnum: AttendanceEligibility },
  { kind: 'major-event', field: 'audience', generatedEnum: EventAudience },
  { kind: 'major-event', field: 'attendanceEligibility', generatedEnum: AttendanceEligibility },
  { kind: 'major-event', field: 'contactType', generatedEnum: ContactType },
  { kind: 'major-event-price', field: 'type', generatedEnum: PriceType },
  { kind: 'event-form', field: 'sigilo', generatedEnum: EventFormSigilo },
  { kind: 'event-form', field: 'responseMode', generatedEnum: EventFormResponseMode },
  { kind: 'form-link', field: 'targetType', generatedEnum: EventFormTargetType },
  { kind: 'form-link', field: 'audiences', generatedEnum: EventFormAudience, arrayItem: true },
  { kind: 'certificate-config', field: 'scope', generatedEnum: CertificateScope, omittedValues: ['OTHER'] },
  { kind: 'certificate-config', field: 'issuedTo', generatedEnum: CertificateIssuedTo },
  { kind: 'certificate-config', field: 'attendeeEligibility', generatedEnum: AttendanceEligibility },
  { kind: 'ticket-config', field: 'recipientSubscriptionRequirement', generatedEnum: TicketSubscriptionRequirement },
  { kind: 'ticket-config', field: 'expirationMode', generatedEnum: TicketExpirationMode },
  { kind: 'sports-tournament', field: 'scoringMode', generatedEnum: SportsScoringMode },
  { kind: 'sports-category', field: 'sport', generatedEnum: SportsPreset },
  { kind: 'sports-category', field: 'format', generatedEnum: SportsFormat },
  { kind: 'sports-category', field: 'athleteIdentifierMode', generatedEnum: SportsAthleteIdentifierMode },
  { kind: 'sports-stage', field: 'type', generatedEnum: SportsStageType },
  { kind: 'sports-match', field: 'livestreamProvider', generatedEnum: SportsLivestreamProvider },
  { kind: 'major-event-subscription', field: 'subscriptionStatus', generatedEnum: SubscriptionStatus },
  { kind: 'event-attendance', field: 'status', generatedEnum: EventAttendanceStatus },
];

function stringsInSchema(schema: TSchema): string[] {
  if ('const' in schema && typeof schema.const === 'string') return [schema.const];
  if ('anyOf' in schema && Array.isArray(schema.anyOf)) return schema.anyOf.flatMap((item) => stringsInSchema(item));
  return [];
}

function transferFieldSchema(entry: TransferEnumField): TSchema {
  const resourceSchema = TRANSFER_RESOURCE_SCHEMAS[entry.kind] as TObject;
  const dataSchema = resourceSchema.properties['data'] as TObject;
  const fieldSchema = dataSchema.properties[entry.field];
  if (!fieldSchema) throw new Error(`Missing transfer schema field ${entry.kind}.${entry.field}`);
  if (!entry.arrayItem) return fieldSchema;
  if (!('items' in fieldSchema) || !fieldSchema.items) {
    throw new Error(`Expected ${entry.kind}.${entry.field} to be an array`);
  }
  return fieldSchema.items as TSchema;
}

describe('data transfer enum compatibility', () => {
  it.each(transferEnumFields)('$kind.$field stays aligned with its generated Prisma enum', (entry) => {
    const schemaValues = stringsInSchema(transferFieldSchema(entry)).sort();
    const omittedValues = new Set(entry.omittedValues ?? []);
    const prismaValues = Object.values(entry.generatedEnum)
      .filter((value) => !omittedValues.has(value))
      .sort();

    expect(schemaValues).toEqual(prismaValues);
  });
});
