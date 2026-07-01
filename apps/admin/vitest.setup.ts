type MediaQueryListener = ((this: MediaQueryList, event: MediaQueryListEvent) => void) | EventListenerObject;

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList => {
    const listeners = new Set<MediaQueryListener>();

    const mediaQueryList = {
      matches: false,
      media: query,
      onchange: null,
      addListener: (listener: MediaQueryListener): void => {
        listeners.add(listener);
      },
      removeListener: (listener: MediaQueryListener): void => {
        listeners.delete(listener);
      },
      addEventListener: (_type: string, listener: MediaQueryListener): void => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: MediaQueryListener): void => {
        listeners.delete(listener);
      },
      dispatchEvent: (event: Event): boolean => {
        for (const listener of listeners) {
          if (typeof listener === 'function') {
            listener.call(mediaQueryList, event as MediaQueryListEvent);
          } else {
            listener.handleEvent(event);
          }
        }
        mediaQueryList.onchange?.call(mediaQueryList, event as MediaQueryListEvent);

        return true;
      },
    } as MediaQueryList;

    return mediaQueryList;
  },
});
