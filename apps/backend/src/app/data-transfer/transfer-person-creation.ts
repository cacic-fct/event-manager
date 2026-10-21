import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  canonicalTransferJson,
  normalizeTransferPhone,
  transferPhoneCandidates,
  TRANSFER_MAX_RESOURCES,
  type TransferPersonData,
  type TransferPersonDecision,
} from '@cacic-fct/shared-data-transfer';
import { getBrazilianPhoneCandidates } from '../common/brazilian-phone';
import type { TransferPersonReference } from './person-transfer-matcher.service';
import type { ResolvedTransferResource } from './data-transfer-adapter';

type PersonMerge = NonNullable<ResolvedTransferResource['personMerge']>;
const personFields = ['name', 'academicId', 'identityDocument', 'email', 'phone'] as const;

export function normalizeTransferPerson(data: TransferPersonData): TransferPersonData {
  const normalized: TransferPersonData = {};
  for (const field of personFields) {
    const value = data[field]?.trim();
    if (!value) continue;
    switch (field) {
      case 'name':
        normalized.name = value.replace(/\s+/g, ' ');
        break;
      case 'email':
        normalized.email = value.toLowerCase();
        break;
      case 'academicId':
        normalized.academicId = value.toUpperCase();
        break;
      case 'identityDocument':
        normalized.identityDocument = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        break;
      case 'phone':
        normalized.phone = normalizeTransferPhone(value) ?? value;
        break;
    }
  }
  return normalized;
}

export function transferPersonKey(reference: TransferPersonReference): string {
  const identity = {
    ...normalizeTransferPerson(reference),
    ...(reference.id ? { id: reference.id } : {}),
    ...(reference.userId ? { userId: reference.userId } : {}),
  };
  return createHash('sha256').update(canonicalTransferJson(identity)).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validatePersonDecisions(input: unknown): TransferPersonDecision[] {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > TRANSFER_MAX_RESOURCES)
    throw new BadRequestException('As confirmações de pessoas são inválidas.');
  const keys = new Set<string>();
  const decisions: TransferPersonDecision[] = [];
  for (const rawDecision of input) {
    const decision: unknown = rawDecision;
    if (
      !isRecord(decision) ||
      typeof decision['key'] !== 'string' ||
      !/^[a-f0-9]{64}$/.test(decision['key']) ||
      keys.has(decision['key']) ||
      typeof decision['action'] !== 'string' ||
      !['create', 'merge', 'skip'].includes(decision['action']) ||
      Object.keys(decision).some((key) => !['key', 'action', 'data', 'personId', 'reviewHash'].includes(key))
    )
      throw new BadRequestException('As confirmações de pessoas são inválidas.');
    const key = decision['key'];
    const reviewHash = decision['reviewHash'];
    if (reviewHash !== undefined && (typeof reviewHash !== 'string' || !/^[a-f0-9]{64}$/.test(reviewHash)))
      throw new BadRequestException('A revisão das pessoas correspondentes é inválida.');
    keys.add(key);
    if (decision['action'] !== 'merge' && decision['personId'] !== undefined)
      throw new BadRequestException('Pessoa de destino inválida.');
    if (decision['action'] === 'skip') {
      if (decision['data'] !== undefined)
        throw new BadRequestException('Uma pessoa ignorada não deve ter dados de criação.');
      decisions.push({ key, action: 'skip' });
      continue;
    }
    const data = decision['data'];
    if (
      !isRecord(data) ||
      Object.entries(data).some(
        ([field, value]) =>
          !personFields.includes(field as (typeof personFields)[number]) ||
          typeof value !== 'string' ||
          !value.trim() ||
          value.length > (field === 'name' || field === 'email' ? 300 : 40),
      )
    )
      throw new BadRequestException('Os dados da pessoa são inválidos.');
    if (decision['action'] === 'merge') {
      const personId = decision['personId'];
      if (typeof personId !== 'string' || !personId.trim())
        throw new BadRequestException('Selecione a pessoa existente para mesclar os dados.');
      decisions.push({
        key,
        action: 'merge',
        personId,
        data: data as TransferPersonData,
        ...(reviewHash ? { reviewHash } : {}),
      });
    } else {
      decisions.push({
        key,
        action: 'create',
        data: data as TransferPersonData,
        ...(reviewHash ? { reviewHash } : {}),
      });
    }
  }
  return decisions;
}

/** Deterministic across previews and retries; no database allocation is performed. */
export function transferPersonId(actorId: string, data: TransferPersonData): string {
  const hash = createHash('sha256').update(canonicalTransferJson({ actorId, data })).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Check identifiers across both new people and merged data before any database write. */
export function assertCompatiblePersonChanges(snapshots: readonly ResolvedTransferResource[]): void {
  const changes: Array<{ id: string; data: TransferPersonData }> = snapshots.flatMap((snapshot) =>
    snapshot.personCreation ? [snapshot.personCreation] : [],
  );
  for (const merge of plannedPersonMerges(snapshots).values()) {
    changes.push({ id: merge.id, data: merge.data });
    for (const email of merge.data.secondaryEmails) changes.push({ id: merge.id, data: { email } });
  }
  const byIdentity = new Map<string, string>();
  for (const change of changes) {
    for (const [field, value] of Object.entries(normalizeTransferPerson(change.data))) {
      if (field === 'name') continue;
      // Legacy files can identify the same person using a document field containing a phone.
      const identities =
        field === 'identityDocument' || field === 'phone'
          ? [
              `identity:${value}`,
              ...[...getBrazilianPhoneCandidates(value), ...transferPhoneCandidates(value)].map(
                (phone) => `identity:${phone}`,
              ),
            ]
          : [`${field}:${value.toLowerCase()}`];
      for (const identity of identities) {
        const other = byIdentity.get(identity);
        if (other && other !== change.id)
          throw new ConflictException(
            'Os dados de pessoas se sobrepõem no arquivo. Unifique os identificadores e revise novamente.',
          );
        byIdentity.set(identity, change.id);
      }
    }
  }
}

/** Combine multiple event rows for one person without losing imported secondary addresses. */
export function plannedPersonMerges(snapshots: readonly ResolvedTransferResource[]): Map<string, PersonMerge> {
  const merges = new Map<string, PersonMerge>();
  for (const snapshot of snapshots) {
    const merge = snapshot.personMerge;
    if (!merge) continue;
    const previous = merges.get(merge.id);
    if (!previous) {
      merges.set(merge.id, { ...merge, data: { ...merge.data } });
      continue;
    }
    for (const field of ['phone', 'identityDocument', 'academicId'] as const) {
      if (previous.data[field] && merge.data[field] && previous.data[field] !== merge.data[field])
        throw new ConflictException(
          'O arquivo propõe dados diferentes para a mesma pessoa. Unifique os dados antes de importar.',
        );
    }
    merges.set(merge.id, {
      ...merge,
      data: {
        ...previous.data,
        ...merge.data,
        secondaryEmails: [...new Set([...previous.data.secondaryEmails, ...merge.data.secondaryEmails])],
      },
    });
  }
  return merges;
}
