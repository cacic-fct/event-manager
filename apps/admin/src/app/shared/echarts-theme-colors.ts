export function readEChartsThemeColor(element: HTMLElement, property: string, fallback: string): string {
  const view = element.ownerDocument.defaultView;
  const value = view?.getComputedStyle(element).getPropertyValue(property).trim() || fallback;

  return resolveEChartsColor(element, value, fallback);
}

export function observeEChartsTheme(element: HTMLElement, refresh: () => void): () => void {
  const document = element.ownerDocument;
  const view = document.defaultView;

  if (!view) {
    return () => undefined;
  }

  let refreshFrame: number | undefined;
  const scheduleRefresh = () => {
    if (refreshFrame !== undefined) {
      view.cancelAnimationFrame(refreshFrame);
    }
    refreshFrame = view.requestAnimationFrame(() => {
      refreshFrame = undefined;
      refresh();
    });
  };
  const observer = new view.MutationObserver(scheduleRefresh);
  const observerOptions: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['class', 'style', 'data-storybook-theme'],
  };
  observer.observe(document.documentElement, observerOptions);
  observer.observe(document.body, observerOptions);

  const colorSchemeQuery = typeof view.matchMedia === 'function' ? view.matchMedia('(prefers-color-scheme: dark)') : null;
  colorSchemeQuery?.addEventListener('change', scheduleRefresh);

  return () => {
    observer.disconnect();
    colorSchemeQuery?.removeEventListener('change', scheduleRefresh);
    if (refreshFrame !== undefined) {
      view.cancelAnimationFrame(refreshFrame);
    }
  };
}

function resolveEChartsColor(element: HTMLElement, value: string, fallback: string): string {
  const document = element.ownerDocument;
  const view = document.defaultView;
  const probe = document.createElement('span');
  probe.style.color = value;

  if (!probe.style.color || !view) {
    return fallback;
  }

  probe.hidden = true;
  document.body.appendChild(probe);
  const resolvedColor = view.getComputedStyle(probe).color;
  probe.remove();

  return resolvedColor && !resolvedColor.includes('light-dark(') ? resolvedColor : fallback;
}
