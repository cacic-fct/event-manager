import { EMPTY, Observable, ObservableInput, catchError, defer, from, of, retry, switchMap, timer } from 'rxjs';

export interface ReplayableSseOptions<T> {
  decode(event: MessageEvent<string>): T | null;
  errorMessage: string;
}

export interface RecoveringReplayableSseOptions<T> extends ReplayableSseOptions<T> {
  recover(): ObservableInput<unknown>;
  maxRetries?: number;
  onTerminalError?(error: unknown): void;
  retryDelayMs?: number;
  retryMaxDelayMs?: number;
}

/**
 * Leaves recoverable EventSource failures to the browser. That preserves the
 * Last-Event-ID cursor and avoids replacing a resumable stream with a terminal
 * RxJS error on an unstable connection.
 */
export function watchReplayableEventSource<T>(url: string, options: ReplayableSseOptions<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    if (typeof EventSource === 'undefined') {
      subscriber.error(new Error(options.errorMessage));
      return undefined;
    }

    const source = new EventSource(url, { withCredentials: true });
    source.onmessage = (event) => {
      try {
        const value = options.decode(event);
        if (value !== null) {
          subscriber.next(value);
        }
      } catch {
        // Ignore malformed data and wait for the next replayable event.
      }
    };
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        subscriber.error(new Error(options.errorMessage));
      }
    };

    return () => source.close();
  });
}

/**
 * Recovers terminal EventSource failures through an authenticated request before
 * reopening the replayable stream. Recoverable network failures still remain
 * with the browser so its Last-Event-ID cursor is preserved.
 */
export function watchRecoveringReplayableEventSource<T>(
  url: string,
  options: RecoveringReplayableSseOptions<T>,
): Observable<T> {
  const {
    recover,
    maxRetries = Number.POSITIVE_INFINITY,
    onTerminalError,
    retryDelayMs = 1_000,
    retryMaxDelayMs = 30_000,
    ...streamOptions
  } = options;
  return watchReplayableEventSource(url, streamOptions).pipe(
    retry({
      count: maxRetries,
      delay: (_, retryCount) =>
        defer(() => from(recover())).pipe(
          catchError(() => of(undefined)),
          switchMap(() => timer(Math.min(retryDelayMs * 2 ** (retryCount - 1), retryMaxDelayMs))),
        ),
    }),
    catchError((error: unknown) => {
      onTerminalError?.(error);
      return EMPTY;
    }),
  );
}

export function decodeTypedSseEvent<T, K extends string>(event: MessageEvent<string>, type: string, key: K): T | null {
  const parsed = JSON.parse(event.data) as { type: string } & Partial<Record<K, T>>;
  const value = parsed[key];
  return parsed.type === type && value != null ? value : null;
}

export function watchReplayableEventSourcePing(url: string, errorMessage: string): Observable<void> {
  return watchReplayableEventSource(url, {
    decode: decodeSsePing,
    errorMessage,
  });
}

export function watchRecoveringReplayableEventSourcePing(
  url: string,
  options: Omit<RecoveringReplayableSseOptions<void>, 'decode'>,
): Observable<void> {
  return watchRecoveringReplayableEventSource(url, {
    ...options,
    decode: decodeSsePing,
  });
}

function decodeSsePing(event: MessageEvent<string>): void | null {
  const parsed: unknown = JSON.parse(event.data);
  return isRecord(parsed) && parsed['type'] === 'heartbeat' ? null : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
