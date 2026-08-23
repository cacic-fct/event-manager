window.parent.postMessage(
  {
    type: 'cacic-silent-sso-complete',
    href: window.location.href,
  },
  window.location.origin,
);
