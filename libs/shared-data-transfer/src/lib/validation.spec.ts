import { describe, expect, it, vi } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import { createTransferTreeFixture } from '../testing';
import { TransferDocumentSchema } from './schema';
import { TRANSFER_MAX_BYTES, TRANSFER_MAX_RESOURCES } from './schema-helpers';
import {
  canonicalTransferJson,
  parseTransferDocument,
  parseTransferJson,
  TransferValidationError,
  validateTransferDocument,
} from './validation';
import { createTransferTemplate } from './template';

describe('portable event data contract', () => {
  it('round-trips a complete stable-ID tree and all new-root templates', () => {
    const document = createTransferTreeFixture();
    expect(document).toMatchObject({ $schema: 'urn:cacic:event-data:v1', version: 1 });
    expect(parseTransferJson(JSON.stringify(document))).toEqual(document);
    for (const kind of ['event', 'group', 'major-event'] as const) {
      expect(Value.Check(TransferDocumentSchema, createTransferTemplate(kind))).toBe(true);
    }
  });

  it('accepts nullable Markdown team orientations and enforces their size limit', () => {
    const document = createTransferTemplate('event');
    const event = document.resources[0];
    const withInstructions = {
      ...document,
      resources: [
        {
          ...event,
          data: {
            ...event.data,
            lecturerInformation: '**Laboratório 3**',
            collectorInformation: '- Conferir evento',
          },
        },
      ],
    };
    expect(parseTransferDocument(withInstructions)).toEqual(withInstructions);
    expect(() =>
      parseTransferDocument({
        ...document,
        resources: [{ ...event, data: { lecturerInformation: 'x'.repeat(10001) } }],
      }),
    ).toThrow(TransferValidationError);
    expect(
      parseTransferDocument({
        ...document,
        resources: [{ ...event, data: { lecturerInformation: null, collectorInformation: null } }],
      }).resources[0].data,
    ).toEqual({ lecturerInformation: null, collectorInformation: null });
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
      'publicationUpdatedBy',
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

  it.each([
    {
      locationName: 'Auditório',
      locationDescription: 'Bloco 5 - Piso térreo',
      locationInternalNotes: 'Retirar a chave na secretaria',
      isVirtual: false,
      latitude: -22,
      longitude: -51,
    },
    { locationName: null, locationDescription: null, isVirtual: true },
    { locationDescription: 'Bloco 6 - Sala 2' },
    { name: 'Evento' },
  ])('preserves structured event locations and omitted fields: %j', (data) => {
    const document = {
      ...createTransferTreeFixture(),
      resources: [{ kind: 'event', id: 'event-1', data }],
    };
    expect(parseTransferDocument(document)).toEqual(document);
    expect(parseTransferJson(JSON.stringify(document))).toEqual(document);
  });

  it('preserves place names, descriptions and internal notes independently', () => {
    const document = {
      ...createTransferTreeFixture(),
      resources: [
        {
          kind: 'place-preset',
          id: 'place-1',
          data: {
            name: 'Auditório',
            locationDescription: 'Bloco 5 - Térreo',
            internalNotes: 'Retirar a chave na secretaria',
          },
        },
      ],
    };
    expect(parseTransferDocument(document)).toEqual(document);
  });

  it('checks the structured location name and description limits', () => {
    const document = createTransferTreeFixture();
    for (const data of [{ locationName: 'A'.repeat(251) }, { locationDescription: 'D'.repeat(2001) }]) {
      expect(() =>
        parseTransferDocument({
          ...document,
          resources: [{ kind: 'event', id: 'event-1', data }],
        }),
      ).toThrow(TransferValidationError);
    }
  });

  it('round-trips publication snapshots and invitation lists without delivery metadata', () => {
    const document = createTransferTreeFixture();
    const publishedAt = new Date(Date.now() - 60_000).toISOString();
    for (const kind of ['event', 'major-event'] as const) {
      const resources = [
        {
          kind,
          id: 'publication-record',
          data: {
            publicationState: 'PUBLISHED',
            publishedAt,
            scheduledPublishAt: null,
            unpublishedAt: null,
            invitationPersonIds: ['person-1'],
          },
        },
      ];
      expect(parseTransferDocument({ ...document, resources }).resources).toEqual(resources);
    }
    expect(
      parseTransferDocument({
        ...document,
        resources: [{ kind: 'group', id: 'group-1', data: { invitationPersonIds: [] } }],
      }).resources[0].data,
    ).toEqual({ invitationPersonIds: [] });
    for (const invitationPersonIds of [
      null,
      ['person-1', 'person-1'],
      Array.from({ length: 1001 }, (_, i) => `p-${i}`),
    ]) {
      expect(() =>
        parseTransferDocument({
          ...document,
          resources: [{ kind: 'event', id: 'event-1', data: { invitationPersonIds } }],
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

  it('rejects accessor properties without executing untrusted code', () => {
    const getter = vi.fn(() => 'Evento');
    const document = createTransferTreeFixture();
    Object.defineProperty(document.resources[2].data, 'name', { enumerable: true, get: getter });

    expect(() => parseTransferDocument(document)).toThrow('propriedade inválida');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects JavaScript-only values before they can disappear or change during JSON serialization', () => {
    const document = createTransferTreeFixture();
    for (const value of [undefined, BigInt(1), () => 'value', new Date(), Object.create({ inherited: true })]) {
      expect(() => parseTransferDocument({ ...document, source: value })).toThrow(TransferValidationError);
    }
    expect(() => parseTransferDocument({ ...document, [Symbol('hidden')]: 'not portable' })).toThrow(
      TransferValidationError,
    );
  });

  it('counts multibyte UTF-8 input against the byte limit in both upload and object validation', () => {
    const input = { ...createTransferTreeFixture(), source: '💻'.repeat(Math.floor(TRANSFER_MAX_BYTES / 4)) };
    const text = JSON.stringify(input);
    expect(text.length).toBeLessThan(TRANSFER_MAX_BYTES);

    expect(() => parseTransferJson(text)).toThrow('limite de 5 MiB');
    expect(() => parseTransferDocument(input)).toThrow('limite de 5 MiB');
  });

  it('rejects duplicate local keys across resource kinds and rows without any identity', () => {
    const document = createTransferTreeFixture();
    expect(() =>
      parseTransferDocument({ ...document, resources: [{ kind: 'event', data: { name: 'Evento' } }] }),
    ).toThrow(TransferValidationError);
    expect(() =>
      parseTransferDocument({
        ...document,
        resources: [
          { kind: 'group', key: 'SAME-KEY', data: { name: 'Grupo' } },
          { kind: 'event', key: 'SAME-KEY', data: { name: 'Evento' } },
        ],
      }),
    ).toThrow('chave local SAME-KEY aparece mais de uma vez');
  });

  it('returns bounded actionable issues to the editor without accepting an invalid document', () => {
    const invalid = validateTransferDocument({
      ...createTransferTreeFixture(),
      resources: Array.from({ length: 50 }, () => ({})),
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues).toHaveLength(30);
    expect(invalid.issues[0].path).toContain('/resources');

    const document = createTransferTreeFixture();
    expect(validateTransferDocument(document)).toEqual({ valid: true, document, issues: [] });
    expect(() => parseTransferJson('{"resources":')).toThrow('JSON inválido');
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
