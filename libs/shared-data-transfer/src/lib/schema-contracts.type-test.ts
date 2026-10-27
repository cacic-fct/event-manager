import { Type } from '@sinclair/typebox';
// The owner contract is intentionally imported only to test shared schema drift.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { parseFormElementsJson } from '@cacic-fct/event-manager-admin-contracts';
import type { SportsPreset } from '@cacic-fct/shared-data-types';
import {
  TRANSFER_RESOURCE_SCHEMAS,
  type ResolvedTransferDocument,
  type TransferDocument,
  type TransferResource,
} from './schema';
import { DateTime, Name } from './schema-helpers';
import {
  AssertContract,
  checkedResource,
  EqualContract,
  type EventTransferOwner,
  type SportsCategoryTransferOwner,
  type ResourceContractKind,
} from './schema-contracts';
import { enumeration } from './schema-helpers';

type _TwentyKindsMatchOwners = AssertContract<
  EqualContract<keyof typeof TRANSFER_RESOURCE_SCHEMAS, ResourceContractKind>
>;

type _ResolvedDocumentRemainsImportable = AssertContract<
  ResolvedTransferDocument extends TransferDocument ? true : false
>;
type _ResolvedDocumentKeepsVersionedSchemaId = AssertContract<
  EqualContract<
    Extract<ResolvedTransferDocument, { version: 1 }>['$schema'],
    Extract<TransferDocument, { version: 1 }>['$schema']
  >
>;

type EventData = Extract<TransferResource, { kind: 'event' }>['data'];
type MatchData = Extract<TransferResource, { kind: 'sports-match' }>['data'];
type CategoryData = Extract<TransferResource, { kind: 'sports-category' }>['data'];
type FormData = Extract<TransferResource, { kind: 'event-form' }>['data'];

type _EventStartIsSerializedOwnerDate = AssertContract<
  EqualContract<Exclude<EventData['startDate'], undefined>, string>
>;
type _FormElementsUseOwnerConversionOutput = AssertContract<
  ReturnType<typeof parseFormElementsJson> extends Exclude<FormData['elements'], undefined> ? true : false
>;
type _CategorySportUsesOwningEnum = AssertContract<
  EqualContract<Exclude<CategoryData['sport'], undefined>, SportsPreset>
>;

// A removed owner property must be reconciled instead of silently dropping the transfer contract.
type EventOwnerWithoutStart = Omit<EventTransferOwner, 'startDate'>;
// @ts-expect-error The checked property is no longer present in the owner contract.
checkedResource<EventOwnerWithoutStart>()('event', { startDate: DateTime });

// A changed owner type must invalidate the matching transfer schema field.
type EventOwnerWithNumericName = Omit<EventTransferOwner, 'name'> & { name: number };
// @ts-expect-error A numeric owner name cannot be encoded by the current string schema.
checkedResource<EventOwnerWithNumericName>()('event', { name: Name });

type CategoryOwnerWithNewSport = Omit<SportsCategoryTransferOwner, 'sport'> & {
  sport: SportsCategoryTransferOwner['sport'] | 'BASEBALL';
};
// @ts-expect-error A newly supported owner enum value must be deliberately added to the transfer schema.
checkedResource<CategoryOwnerWithNewSport>()('sports-category', { sport: enumeration('SOCCER', 'FUTSAL') });

// Sensitive owner fields remain excluded by the explicit export allowlist.
// @ts-expect-error Sports operational state is not part of a portable setup resource.
type ForbiddenSportsState = MatchData['state'];

// Newly added, non-allowlisted owner fields never enter the resource schema implicitly.
const allowlistedEvent = { name: Name };
// @ts-expect-error The contract builder rejects properties outside the explicit owner allowlist.
checkedResource<Pick<EventTransferOwner, 'name'>>()('event', { ...allowlistedEvent, confidential: Type.String() });

// @ts-expect-error Certificate identity is intentionally narrower than the owner's internal OTHER scope.
const unsupportedCertificateScope: Exclude<
  Extract<TransferResource, { kind: 'certificate-config' }>['data']['scope'],
  undefined
> = 'OTHER';

void unsupportedCertificateScope;

export type SchemaContractTypeTests =
  | _TwentyKindsMatchOwners
  | _ResolvedDocumentRemainsImportable
  | _ResolvedDocumentKeepsVersionedSchemaId
  | _EventStartIsSerializedOwnerDate
  | _FormElementsUseOwnerConversionOutput
  | _CategorySportUsesOwningEnum
  | ForbiddenSportsState;
