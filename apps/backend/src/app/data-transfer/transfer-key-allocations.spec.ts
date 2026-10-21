import { BadRequestException, ConflictException } from '@nestjs/common';
import { createTransferTemplate, parseTransferDocument } from '@cacic-fct/shared-data-transfer';
import { TransferKeyAllocations } from './transfer-key-allocations';
const { jest } = import.meta;

describe('preview-bound symbolic resource keys', () => {
  it.each(['constructor', 'toString', 'hasOwnProperty'])(
    'allocates the object property name %s as an ordinary key',
    (key) => {
      const template = createTransferTemplate('event');
      const raw = parseTransferDocument({ ...template, resources: [{ ...template.resources[0], key }] });
      const resolver = new TransferKeyAllocations();
      const preview = resolver.preview(raw, 'organizer-1');
      preview.retain?.();
      expect(preview.allocation?.ids[key]).toBe(preview.document.resources[0].id);
      expect(preview.allocation?.ids[key]).toMatch(/^[0-9a-f-]{36}$/);
      expect(resolver.apply(raw, 'organizer-1', preview.allocation?.token)).toEqual(preview.document);
    },
  );

  it('keeps allocations transient until the plan is authorized', () => {
    const raw = createTransferTemplate('event');
    const resolver = new TransferKeyAllocations();
    const preview = resolver.preview(raw, 'organizer-1');
    expect(() => resolver.apply(raw, 'organizer-1', preview.allocation?.token)).toThrow(ConflictException);
    preview.retain?.();
    expect(resolver.apply(raw, 'organizer-1', preview.allocation?.token)).toEqual(preview.document);
  });

  it('evicts only the oldest allocation of the same organizer', () => {
    const raw = createTransferTemplate('event');
    const resolver = new TransferKeyAllocations();
    const victim = resolver.preview(raw, 'organizer-1');
    victim.retain?.();
    const oldest = resolver.preview(raw, 'organizer-2');
    oldest.retain?.();
    for (let index = 0; index < 100; index++) resolver.preview(raw, 'organizer-2').retain?.();
    expect(resolver.apply(raw, 'organizer-1', victim.allocation?.token)).toEqual(victim.document);
    expect(() => resolver.apply(raw, 'organizer-2', oldest.allocation?.token)).toThrow(ConflictException);
  });

  it('allocates UUIDs on the server and resolves the complete child graph', () => {
    const raw = createTransferTemplate('major-event');
    const resolver = new TransferKeyAllocations();
    const preview = resolver.preview(raw, 'organizer-1');
    preview.retain?.();
    expect(preview.allocation).toBeDefined();
    for (const row of preview.document.resources)
      expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const event = preview.document.resources.find((row) => row.kind === 'event');
    expect(event?.kind === 'event' && event.data.eventGroupId).toBe(preview.allocation?.ids['GROUP-1']);
    expect(event?.kind === 'event' && event.data.majorEventId).toBe(preview.allocation?.ids['MAJOR-1']);
    expect(resolver.apply(raw, 'organizer-1', preview.allocation?.token)).toEqual(preview.document);
  });

  it('binds allocations to the authenticated organizer and exact file', () => {
    const raw = createTransferTemplate('event');
    const resolver = new TransferKeyAllocations();
    const preview = resolver.preview(raw, 'organizer-1');
    preview.retain?.();
    expect(() => resolver.apply(raw, 'organizer-2', preview.allocation?.token)).toThrow(ConflictException);
    const changed = {
      ...raw,
      resources: raw.resources.map((row) =>
        row.kind === 'event' ? { ...row, data: { ...row.data, name: 'Outro evento' } } : row,
      ),
    };
    expect(() => resolver.apply(changed, 'organizer-1', preview.allocation?.token)).toThrow(ConflictException);
    expect(() => resolver.apply(raw, 'organizer-1')).toThrow(ConflictException);
  });

  it('expires and consumes allocations without reusing generated identities', () => {
    const raw = createTransferTemplate('event');
    const resolver = new TransferKeyAllocations();
    const now = Date.now();
    const preview = resolver.preview(raw, 'organizer-1');
    preview.retain?.();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 16 * 60000);
    expect(() => resolver.apply(raw, 'organizer-1', preview.allocation?.token)).toThrow(ConflictException);
    clock.mockRestore();
    const fresh = resolver.preview(raw, 'organizer-1');
    fresh.retain?.();
    expect(fresh.allocation?.ids).not.toEqual(preview.allocation?.ids);
    resolver.consume(fresh.allocation?.token);
    expect(() => resolver.apply(raw, 'organizer-1', fresh.allocation?.token)).toThrow(ConflictException);
  });

  it('supports aliases for existing static IDs and rejects references to the wrong kind', () => {
    const raw = createTransferTemplate('major-event');
    const wrong = {
      ...raw,
      resources: raw.resources.map((row) =>
        row.kind === 'event' ? { ...row, data: { ...row.data, eventGroupId: 'MAJOR-1' } } : row,
      ),
    };
    const resolver = new TransferKeyAllocations();
    expect(() => resolver.preview(wrong, 'organizer-1')).toThrow(BadRequestException);
    const existing = { ...raw, resources: raw.resources.map((row) => ({ ...row, id: `${row.key}-existing` })) };
    const preview = resolver.preview(existing, 'organizer-1');
    expect(preview.allocation).toBeUndefined();
    expect(resolver.apply(existing, 'organizer-1')).toEqual(preview.document);
  });

  it('rejects records without any identity and globally ambiguous keys', () => {
    const raw = createTransferTemplate('event');
    expect(() => parseTransferDocument({ ...raw, resources: [{ kind: 'event', data: {} }] })).toThrow();
    expect(() =>
      parseTransferDocument({ ...raw, resources: [raw.resources[0], { kind: 'group', key: 'EVENT-1', data: {} }] }),
    ).toThrow();
  });
});
