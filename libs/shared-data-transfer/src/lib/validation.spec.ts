import { describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { createTransferTreeFixture } from '../testing';
import { TransferDocumentSchema } from './schema';
import { TRANSFER_MAX_BYTES, TRANSFER_MAX_RESOURCES } from './schema-helpers';
import { canonicalTransferJson, parseTransferDocument, parseTransferJson, TransferValidationError } from './validation';
import { createTransferTemplate } from './template';

describe('portable event data contract', () => {
  it('round-trips a complete stable-ID tree and all new-root templates', () => {
    const document = createTransferTreeFixture();
    expect(parseTransferJson(JSON.stringify(document))).toEqual(document);
    for (const kind of ['event', 'group', 'major-event'] as const) {
      expect(Value.Check(TransferDocumentSchema, createTransferTemplate(kind))).toBe(true);
    }
  });

  it('creates scoped templates against existing parent IDs without reparenting existing records', () => {
    const now = new Date();
    const major = createTransferTemplate('major-event', now, { kind: 'major-event', id: 'major-existing' });
    expect(parseTransferDocument(major)).toEqual(major);
    expect(major.resources[0]).toEqual({ kind: 'major-event', id: 'major-existing', data: {} });
    expect(major.resources[1]).toMatchObject({
      kind: 'group',
      key: 'GROUP-1',
      data: { majorEventId: 'major-existing' },
    });
    expect(major.resources[2]).toMatchObject({
      kind: 'event',
      key: 'EVENT-1',
      data: { eventGroupId: 'GROUP-1', majorEventId: 'major-existing' },
    });

    const group = createTransferTemplate('group', now, { kind: 'group', id: 'group-existing' });
    expect(parseTransferDocument(group)).toEqual(group);
    expect(group.resources[0]).toEqual({ kind: 'group', id: 'group-existing', data: {} });
    expect(group.resources[1]).toMatchObject({
      kind: 'event',
      key: 'EVENT-1',
      data: { eventGroupId: 'group-existing' },
    });

    const event = createTransferTemplate('event', now, { kind: 'event', id: 'event-existing' });
    expect(parseTransferDocument(event)).toEqual(event);
    expect(event.resources).toEqual([{ kind: 'event', id: 'event-existing', data: {} }]);

    const newMajorTree = createTransferTemplate('major-event', now);
    expect(newMajorTree.resources[0]).toMatchObject({ kind: 'major-event', key: 'MAJOR-1' });
    expect(newMajorTree.resources[0].id).toBeUndefined();
  });

  it('rejects schema drift and read-only/security-sensitive fields before writing', () => {
    const document = createTransferTreeFixture();
    expect(() => parseTransferDocument({ ...document, version: 2 })).toThrow(TransferValidationError);
    expect(() => parseTransferDocument({ ...document, $schema: 'https://attacker.invalid/schema.json' })).toThrow(
      TransferValidationError,
    );
    for (const field of [
      'id',
      'publicationState',
      'createdById',
      'onlineAttendanceCode',
      'deletedAt',
      'slotsAvailable',
      'audienceInvitations',
    ]) {
      const resource = document.resources[2];
      expect(() =>
        parseTransferDocument({
          ...document,
          resources: [{ ...resource, data: { ...resource.data, [field]: 'forged' } }],
        }),
      ).toThrow(TransferValidationError);
    }
  });

  it('rejects duplicate identities, malformed dates and nonfinite numbers', () => {
    const document = createTransferTreeFixture();
    expect(() =>
      parseTransferDocument({ ...document, resources: [document.resources[0], document.resources[0]] }),
    ).toThrow(TransferValidationError);
    expect(() =>
      parseTransferDocument({ ...document, resources: [{ kind: 'event', id: 'x', data: { startDate: 'tomorrow' } }] }),
    ).toThrow(TransferValidationError);
    expect(() =>
      parseTransferDocument({ ...document, resources: [{ kind: 'event', id: 'x', data: { latitude: Number.NaN } }] }),
    ).toThrow(TransferValidationError);
  });

  it('rejects prototype keys even inside extensible domain settings', () => {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      const text = `{"format":"cacic-event-data","version":1,"resources":[{"kind":"sports-category","id":"x","data":{"scoreRules":{"${key}":{}}}}]}`;
      expect(() => parseTransferJson(text)).toThrow(TransferValidationError);
    }
    expect({}.toString).toBe(Object.prototype.toString);
  });

  it('bounds file size, record count, complexity and cyclic input', () => {
    expect(() => parseTransferJson(' '.repeat(TRANSFER_MAX_BYTES + 1))).toThrow(TransferValidationError);
    const document = createTransferTreeFixture();
    expect(() =>
      parseTransferDocument({
        ...document,
        resources: Array.from({ length: TRANSFER_MAX_RESOURCES + 1 }, (_, index) => ({
          kind: 'group',
          id: `g-${index}`,
          data: { name: 'Grupo' },
        })),
      }),
    ).toThrow(TransferValidationError);
    const cyclic: Record<string, unknown> = {};
    cyclic['child'] = cyclic;
    expect(() => parseTransferDocument(cyclic)).toThrow(TransferValidationError);
    let nested: unknown = {};
    for (let i = 0; i < 40; i++) nested = { nested };
    expect(() => parseTransferDocument(nested)).toThrow(TransferValidationError);
  });

  it('fingerprints object key order consistently without conflating array order', () => {
    expect(canonicalTransferJson({ b: 2, a: { z: 1, x: 0 } })).toBe(canonicalTransferJson({ a: { x: 0, z: 1 }, b: 2 }));
    expect(canonicalTransferJson([1, 2])).not.toBe(canonicalTransferJson([2, 1]));
  });

  it('accepts personal references while rejecting automatic person creation and sports results', () => {
    const document = createTransferTreeFixture();
    const eventId = document.resources[2].id;
    expect(
      parseTransferDocument({
        ...document,
        resources: [
          {
            kind: 'event-subscription',
            id: 'external-row-1',
            data: { eventId, person: { name: 'Pessoa Existente', email: 'pessoa@example.test' } },
          },
        ],
      }).resources,
    ).toHaveLength(1);
    expect(() =>
      parseTransferDocument({ ...document, resources: [{ kind: 'person', id: 'person-1', data: { name: 'Pessoa' } }] }),
    ).toThrow(TransferValidationError);
    expect(() =>
      parseTransferDocument({
        ...document,
        resources: [{ kind: 'sports-match', id: 'match-1', data: { scoreboard: { home: 999 } } }],
      }),
    ).toThrow(TransferValidationError);
  });
});
