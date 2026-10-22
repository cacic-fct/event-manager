import type { Request, Response } from 'express';

/** The version belongs to this frontend image, never the independently deployed API. */
export function frontendVersionStream(version: string) {
  return (_req: Request, res: Response): void => {
    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'CDN-Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // A replacement SSR process sends its own version when EventSource reconnects.
    res.write(`retry: 5000\nevent: frontend-version\ndata: ${JSON.stringify({ version })}\n\n`);
    // Transport keepalive only: no version lookups or application polling.
    const heartbeat = setInterval(() => {
      if (!res.write(': keepalive\n\n')) res.end();
    }, 25_000);
    heartbeat.unref();
    res.once('close', () => clearInterval(heartbeat));
  };
}
