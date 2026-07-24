import { vi } from 'vitest';

export class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly close = vi.fn();
  readyState = 1;

  constructor(
    readonly url: string,
    readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this);
  }

  emitMessage(data: object | string = {}): void {
    this.onmessage?.({ data: typeof data === 'string' ? data : JSON.stringify(data) } as MessageEvent<string>);
  }

  emitError(): void {
    this.onerror?.({} as Event);
  }
}

export function installFakeEventSource(): () => void {
  const previous = globalThis.EventSource;
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);

  return () => {
    FakeEventSource.instances = [];
    Object.defineProperty(globalThis, 'EventSource', {
      configurable: true,
      value: previous,
      writable: true,
    });
  };
}
