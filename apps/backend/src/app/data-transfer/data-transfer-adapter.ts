import type {
  TransferExportRequest,
  TransferIssue,
  TransferResource,
  TransferResourceKind,
  TransferChange,
  TransferTarget,
  ResolvedTransferDocument,
} from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { AuthorizationResourceContext } from '../authorization/authorization-policy.service';
import type { FrozenOperation, FrozenResourceService } from '../common/frozen-resource.service';
import type { Prisma } from '@prisma/client';

/** A stable reference to another resource in the same transfer document. */
export interface TransferResourceReference {
  kind: TransferResourceKind;
  id: string;
}

/** Server-resolved target context used for scoped authorization and frozen checks. */
export type TransferAuthorizationScope = Pick<
  AuthorizationResourceContext,
  | 'eventId'
  | 'eventGroupId'
  | 'majorEventId'
  | 'sportsTournamentId'
  | 'sportsCategoryId'
  | 'sportsMatchId'
  | 'eventFormId'
  | 'eventFormLinkId'
  | 'folderId'
>;

export interface TransferAdapterContext {
  tx: Prisma.TransactionClient;
  actor: AuthenticatedUser;
  document: ResolvedTransferDocument;
  requestedScope?: TransferTarget;
  frozenResources: FrozenResourceService;
}

/**
 * Result of resolving one proposed resource against the current database.
 * `current` contains only fields authorized for transfer; it must never contain
 * unrelated labels, secrets, or participant data. A skipped result is for
 * authorized, non-fatal resolution issues such as an unavailable external
 * reference. Authorization failures should throw instead.
 */
export interface ResolvedTransferResource {
  resource: TransferResource;
  current: TransferResource | null;
  /** Current database revision (normally updatedAt as ISO); used in plan hashes. */
  revision: string | null;
  /** Canonical target identity when source IDs resolve to an existing natural key. */
  identityKey?: string;
  /** Actual database ID when an external participation row resolves by its natural key. */
  resolvedId?: string;
  scope: TransferAuthorizationScope;
  /** References whose blocked rows block this row; parent IDs and writeDependencies determine write order. */
  dependencies: readonly TransferResourceReference[];
  /** Additional write-order constraints, separate from partial-plan dependencies. */
  writeDependencies?: readonly TransferResourceReference[];
  /** Revisions of authorized related writes, fingerprinted without displaying internal versions in the UI. */
  relatedRevisions?: readonly (TransferResourceReference & { revision: string | null })[];
  /** This record is a backing row created/updated by another aggregate resource in the file. */
  ownedBy?: TransferResourceReference;
  /** Authorized side effects on related records included in the preview. */
  additionalChanges?: readonly TransferChange[];
  /** An adapter-owned, safe explanation for a resource that cannot be resolved. */
  skip?: { message: string };
}

export type TransferWriteAction = 'create' | 'update';

export type TransferEffect = () => Promise<void>;

export interface TransferAdapterApplyResult {
  /** Optional new target revision after a successful write. */
  revision?: string | null;
  /** Effects run only after the generic transaction commits. Never close over the transaction client. */
  postCommitEffects?: readonly TransferEffect[];
}

export interface TransferAdapterExportResult {
  resources: TransferResource[];
  issues: TransferIssue[];
}

/**
 * Backend adapter for one or more resource kinds. Adapters own current-record
 * reads, domain validation, scoped permission checks, and writes. The generic
 * transfer service owns schema validation, diffing, dependency ordering,
 * preview hashing, partial-apply policy, and transaction coordination.
 */
export interface DataTransferAdapter {
  /** Read persisted values inside the apply transaction, without repeating preview authorization. */
  readAppliedResource?(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<TransferResource>;
  readonly kinds: readonly TransferResourceKind[];
  readonly dependencyOrder: number;

  /**
   * Optional ownership handoff for backing records whose database kind differs
   * from the domain aggregate that owns their lifecycle (sports match Events,
   * for example). Claimed resources are resolved, authorized, and written by
   * this adapter instead of the default adapter for their kind.
   */
  claims?(resource: TransferResource, context: TransferAdapterContext): Promise<boolean>;

  /** Optional export ownership handoff for an aggregate root selected by ID. */
  claimsTarget?(target: TransferTarget, context: TransferAdapterContext): Promise<boolean>;

  resolve(resource: TransferResource, context: TransferAdapterContext): Promise<ResolvedTransferResource>;

  assertRead(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void>;

  assertWrite(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<void>;

  assertMutable(
    snapshot: ResolvedTransferResource,
    operation: FrozenOperation,
    context: TransferAdapterContext,
  ): Promise<void>;

  validate(snapshot: ResolvedTransferResource, context: TransferAdapterContext): Promise<void>;

  /** Validate aggregate rules against the resources that survived authorization and dependency checks. */
  validatePlan?(
    snapshot: ResolvedTransferResource,
    context: TransferAdapterContext,
    executableResources: readonly TransferResource[],
  ): Promise<void>;

  /**
   * Apply one create/update in the caller's transaction. Implementations must
   * preserve `resource.id`, must not change an existing ID, and must use an
   * optimistic conditional write against `snapshot.revision`.
   */
  apply(
    snapshot: ResolvedTransferResource,
    action: TransferWriteAction,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterApplyResult>;

  exportTarget(
    target: TransferTarget,
    options: Omit<TransferExportRequest, 'target'>,
    context: TransferAdapterContext,
  ): Promise<TransferAdapterExportResult>;
}
