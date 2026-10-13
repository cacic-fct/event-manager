import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  canonicalTransferJson,
  type ResolvedTransferDocument,
  type TransferAllocation,
  type TransferDocument,
  type TransferResource,
  type TransferResourceKind,
} from '@cacic-fct/shared-data-transfer';

interface StoredAllocation {
  actorId: string;
  fingerprint: string;
  expiresAt: number;
  ids: Record<string, string>;
}

const referenceKinds: Readonly<Record<string, TransferResourceKind>> = {
  majorEventId: 'major-event',
  eventGroupId: 'group',
  eventId: 'event',
  ownerEventId: 'event',
  ownerMajorEventId: 'major-event',
  formId: 'event-form',
  priceId: 'major-event-price',
  priceTierId: 'price-tier',
  ticketConfigId: 'ticket-config',
  tournamentId: 'sports-tournament',
  categoryId: 'sports-category',
  stageId: 'sports-stage',
  venueId: 'sports-venue',
  parentVenueId: 'sports-venue',
  placePresetId: 'place-preset',
  registrationFormId: 'event-form',
  allowedEventIds: 'event',
  selectedEventIds: 'event',
  regularAttendancePriceTierIds: 'price-tier',
  includedPriceTierIds: 'price-tier',
  recipientAllowedPriceTierIds: 'price-tier',
  purchaseVisiblePriceTierIds: 'price-tier',
  priceTierIds: 'price-tier',
};

/** Bounded, short-lived, actor-bound preview allocations. A restart invalidates pending key-only previews. */
export class TransferKeyAllocations {
  private readonly entries = new Map<string, StoredAllocation>();
  private readonly lifetimeMs = 15 * 60 * 1000;
  private readonly maximumEntries = 100;

  preview(
    document: TransferDocument,
    actorId: string,
  ): { document: ResolvedTransferDocument; allocation?: TransferAllocation } {
    this.prune();
    if (!document.resources.some((resource) => !resource.id)) return { document: this.resolve(document, {}) };
    const ids: Record<string, string> = {};
    for (const resource of document.resources) if (!resource.id && resource.key) ids[resource.key] = randomUUID();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + this.lifetimeMs;
    if (this.entries.size >= this.maximumEntries) this.entries.delete(this.entries.keys().next().value ?? '');
    this.entries.set(token, { actorId, fingerprint: this.fingerprint(document), expiresAt, ids });
    return {
      document: this.resolve(document, ids),
      allocation: { token, expiresAt: new Date(expiresAt).toISOString(), ids },
    };
  }

  apply(document: TransferDocument, actorId: string, token?: string): ResolvedTransferDocument {
    this.prune();
    if (!document.resources.some((resource) => !resource.id)) {
      if (token) throw new BadRequestException('Este arquivo não utiliza uma alocação de IDs.');
      return this.resolve(document, {});
    }
    const allocation = token ? this.entries.get(token) : undefined;
    if (!allocation || allocation.actorId !== actorId || allocation.fingerprint !== this.fingerprint(document))
      throw new ConflictException('A prévia das chaves locais expirou ou o arquivo mudou. Revise novamente.');
    return this.resolve(document, allocation.ids);
  }

  consume(token?: string): void {
    if (token) this.entries.delete(token);
  }

  private resolve(document: TransferDocument, ids: Record<string, string>): ResolvedTransferDocument {
    const keys = new Map<string, { id: string; kind: TransferResourceKind }>();
    for (const resource of document.resources) {
      const id = resource.id ?? (resource.key ? ids[resource.key] : undefined);
      if (!id) throw new BadRequestException('Informe um ID existente ou uma chave local para cada registro.');
      if (resource.key) keys.set(resource.key, { id, kind: resource.kind });
    }
    const resolveReference = (field: string, value: unknown): unknown => {
      const kind = referenceKinds[field];
      if (!kind) return value;
      if (Array.isArray(value)) return value.map((entry) => resolveReference(field, entry));
      if (typeof value !== 'string' || !keys.has(value)) return value;
      const referenced = keys.get(value);
      if (referenced?.kind !== kind)
        throw new BadRequestException(`A chave ${value} não representa o tipo esperado para ${field}.`);
      return referenced.id;
    };
    const resources = document.resources.map((resource) => ({
      ...resource,
      id: resource.id ?? ids[resource.key ?? ''],
      data: Object.fromEntries(
        Object.entries(resource.data).map(([field, value]) => [field, resolveReference(field, value)]),
      ),
    }));
    // Keys are normalized only after validating the public schema; the schema already fixes kind/data correspondence.
    return { ...document, resources: resources as TransferResource[] };
  }

  private fingerprint(document: TransferDocument): string {
    return createHash('sha256').update(canonicalTransferJson(document)).digest('hex');
  }

  private prune(): void {
    for (const [token, value] of this.entries) if (value.expiresAt <= Date.now()) this.entries.delete(token);
  }
}
