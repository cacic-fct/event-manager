import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { frontendVersionStream } from './frontend-version-stream.ts';

test('streams the frontend image version immediately with cache and buffering disabled', async () => {
  const app = express();
  app.get('/app/api/version/events', frontendVersionStream('frontend-build-42'));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const abort = new AbortController();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/app/api/version/events`, { signal: abort.signal });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store, no-transform');
    assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
    assert.equal(response.headers.get('x-accel-buffering'), 'no');
    assert.ok(response.body);
    const first = await response.body.getReader().read();
    const text = new TextDecoder().decode(first.value);
    assert.match(text, /event: frontend-version\n/);
    assert.match(text, /data: {"version":"frontend-build-42"}\n\n/);
    assert.match(text, /retry: 5000/);
  } finally {
    abort.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
