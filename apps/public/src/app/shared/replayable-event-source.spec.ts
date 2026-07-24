import { decodeTypedSseEvent, watchReplayableEventSource } from '@cacic-fct/shared-angular';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';

describe('decodeTypedSseEvent', () => {
  it.each([false, 0, ''])('preserves falsy payload values', (value) => {
    const event = { data: JSON.stringify({ type: 'updated', value }) } as MessageEvent<string>;

    expect(decodeTypedSseEvent<typeof value, 'value'>(event, 'updated', 'value')).toBe(value);
  });

  it('returns null for a different type or an absent payload value', () => {
    expect(
      decodeTypedSseEvent<string, 'value'>(
        { data: JSON.stringify({ type: 'other', value: 'payload' }) } as MessageEvent<string>,
        'updated',
        'value',
      ),
    ).toBeNull();
    expect(
      decodeTypedSseEvent<string, 'value'>(
        { data: JSON.stringify({ type: 'updated', value: null }) } as MessageEvent<string>,
        'updated',
        'value',
      ),
    ).toBeNull();
  });
});

describe('watchReplayableEventSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('delivers valid events, ignores invalid data, and leaves recoverable errors to EventSource', () => {
    installFakeEventSource();
    const next = vi.fn();
    const error = vi.fn();
    const subscription = watchReplayableEventSource('/api/events', {
      decode: (event) => (event.data === 'valid' ? event.data : null),
      errorMessage: 'Falha no stream.',
    }).subscribe({ next, error });
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage('ignored');
    source.emitMessage('valid');
    source.emitError();

    expect(next).toHaveBeenCalledExactlyOnceWith('valid');
    expect(error).not.toHaveBeenCalled();

    subscription.unsubscribe();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('ignores malformed events, reports terminal failures, and fails cleanly without EventSource', () => {
    installFakeEventSource();
    const next = vi.fn();
    const error = vi.fn();
    watchReplayableEventSource('/api/events', {
      decode: () => {
        throw new Error('malformed');
      },
      errorMessage: 'Falha no stream.',
    }).subscribe({ next, error });
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage('broken');
    source.readyState = FakeEventSource.CLOSED;
    source.emitError();

    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Falha no stream.' }));

    vi.stubGlobal('EventSource', undefined);
    const unsupported = vi.fn();
    watchReplayableEventSource('/api/events', { decode: () => 'value', errorMessage: 'Indisponível.' }).subscribe({
      error: unsupported,
    });
    expect(unsupported).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Indisponível.' }));
  });
});
