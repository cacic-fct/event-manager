import { Observable } from 'rxjs';

export interface ReplayableSseOptions<T> {
  decode(event: MessageEvent<string>): T | null;
  errorMessage: string;
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

export function decodeTypedSseEvent<T, K extends string>(event: MessageEvent<string>, type: string, key: K): T | null {
  const parsed = JSON.parse(event.data) as { type: string } & Partial<Record<K, T>>;
  const value = parsed[key];
  return parsed.type === type && value ? value : null;
}

export function watchReplayableEventSourcePing(url: string, errorMessage: string): Observable<void> {
  return watchReplayableEventSource(url, {
    decode: () => undefined,
    errorMessage,
  });
}
