import {
  decodeTypedSseEvent,
  watchRecoveringReplayableEventSource,
  watchRecoveringReplayableEventSourcePing,
  watchReplayableEventSource,
} from '@cacic-fct/shared-angular';
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

  it('runs authenticated recovery before reopening a terminal stream', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    const recover = vi.fn().mockResolvedValue(undefined);
    const next = vi.fn();
    const subscription = watchRecoveringReplayableEventSource('/api/events', {
      decode: (event) => event.data,
      errorMessage: 'Falha no stream.',
      recover,
      retryDelayMs: 250,
    }).subscribe(next);

    const first = FakeEventSource.instances[0] as FakeEventSource;
    first.emitMessage('antes');
    first.readyState = FakeEventSource.CLOSED;
    first.emitError();
    await vi.advanceTimersByTimeAsync(249);

    expect(recover).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    (FakeEventSource.instances[1] as FakeEventSource).emitMessage('depois');
    expect(next).toHaveBeenNthCalledWith(1, 'antes');
    expect(next).toHaveBeenNthCalledWith(2, 'depois');

    subscription.unsubscribe();
    vi.useRealTimers();
  });

  it('reopens the stream even when the authenticated recovery request fails', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    const recover = vi.fn().mockRejectedValue(new Error('Sessão indisponível.'));
    const subscription = watchRecoveringReplayableEventSource('/api/events', {
      decode: (event) => event.data,
      errorMessage: 'Falha no stream.',
      recover,
      retryDelayMs: 100,
    }).subscribe();

    const first = FakeEventSource.instances[0] as FakeEventSource;
    first.readyState = FakeEventSource.CLOSED;
    first.emitError();
    await vi.advanceTimersByTimeAsync(100);

    expect(recover).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(2);

    subscription.unsubscribe();
    vi.useRealTimers();
  });

  it('cancels a pending recovery instead of reopening after teardown', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    let resolveRecovery!: () => void;
    const recover = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRecovery = resolve;
        }),
    );
    const subscription = watchRecoveringReplayableEventSource('/api/events', {
      decode: (event) => event.data,
      errorMessage: 'Falha no stream.',
      recover,
      retryDelayMs: 100,
    }).subscribe();
    const first = FakeEventSource.instances[0] as FakeEventSource;
    first.readyState = FakeEventSource.CLOSED;
    first.emitError();
    await Promise.resolve();

    expect(recover).toHaveBeenCalledOnce();
    subscription.unsubscribe();
    resolveRecovery();
    await vi.advanceTimersByTimeAsync(100);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(first.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('backs off and stops after repeated terminal recovery failures', async () => {
    vi.useFakeTimers();
    installFakeEventSource();
    const recover = vi.fn().mockRejectedValue(new Error('Sessão indisponível.'));
    const complete = vi.fn();
    const onTerminalError = vi.fn();
    const subscription = watchRecoveringReplayableEventSource('/api/events', {
      decode: (event) => event.data,
      errorMessage: 'Falha no stream.',
      recover,
      maxRetries: 2,
      onTerminalError,
      retryDelayMs: 10,
      retryMaxDelayMs: 20,
    }).subscribe({ complete });

    const first = FakeEventSource.instances[0] as FakeEventSource;
    first.readyState = FakeEventSource.CLOSED;
    first.emitError();
    await vi.advanceTimersByTimeAsync(10);

    const second = FakeEventSource.instances[1] as FakeEventSource;
    second.readyState = FakeEventSource.CLOSED;
    second.emitError();
    await vi.advanceTimersByTimeAsync(19);
    expect(FakeEventSource.instances).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(1);
    const third = FakeEventSource.instances[2] as FakeEventSource;
    third.readyState = FakeEventSource.CLOSED;
    third.emitError();

    expect(recover).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(3);
    expect(complete).toHaveBeenCalledOnce();
    expect(onTerminalError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: 'Falha no stream.' }));

    subscription.unsubscribe();
    vi.useRealTimers();
  });

  it('does not emit heartbeat messages as invalidations', () => {
    installFakeEventSource();
    const next = vi.fn();
    const subscription = watchRecoveringReplayableEventSourcePing('/api/events', {
      errorMessage: 'Falha no stream.',
      recover: () => Promise.resolve(),
    }).subscribe(next);
    const source = FakeEventSource.instances[0] as FakeEventSource;

    source.emitMessage(JSON.stringify({ type: 'heartbeat', timestamp: 1 }));
    source.emitMessage(JSON.stringify({ type: 'CATALOG_INVALIDATED' }));

    expect(next).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });
});
