// Mock IntersectionObserver for tests
class MockIntersectionObserver {
  constructor(
    public callback: IntersectionObserverCallback,
    public options?: IntersectionObserverInit,
  ) {}

  observe() {
    return null;
  }

  unobserve() {
    return null;
  }

  disconnect() {
    return null;
  }

  takeRecords() {
    return [];
  }
}

type BrowserGlobalWithObservers = typeof globalThis & {
  window?: Window & typeof globalThis;
  IntersectionObserver?: typeof IntersectionObserver;
  ResizeObserver?: typeof ResizeObserver;
};

const browserGlobal = globalThis as BrowserGlobalWithObservers;
const intersectionObserverMock = MockIntersectionObserver as unknown as typeof IntersectionObserver;
browserGlobal.IntersectionObserver = intersectionObserverMock;
browserGlobal.window?.IntersectionObserver = intersectionObserverMock;

// Mock ResizeObserver for tests
class MockResizeObserver {
  constructor(public callback: ResizeObserverCallback) {}

  observe() {
    return null;
  }

  unobserve() {
    return null;
  }

  disconnect() {
    return null;
  }
}

const resizeObserverMock = MockResizeObserver as unknown as typeof ResizeObserver;
browserGlobal.ResizeObserver = resizeObserverMock;
browserGlobal.window?.ResizeObserver = resizeObserverMock;
