import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';

const child = Object.assign(new EventEmitter(), {
  stdin: { on: jest.fn(), end: jest.fn() },
  kill: jest.fn(),
});
let complete: (error: Error | null, stdout: string, stderr: string) => void;
const execFile = Object.assign(jest.fn(), {
  [promisify.custom]: () =>
    Object.assign(
      new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        complete = (error, stdout, stderr) => (error ? reject(error) : resolve({ stdout, stderr }));
      }),
      { child },
    ),
});
jest.unstable_mockModule('node:child_process', () => ({ execFile }));
const { extractCertificatePdfId } = await import('./extract-certificate-pdf-id');

it('kills a cancelled parser and waits for close before releasing its caller', async () => {
  const controller = new AbortController();
  const extraction = extractCertificatePdfId(Buffer.from('%PDF-1.7'), controller.signal);
  let settled = false;
  const result = extraction.catch(() => {
    settled = true;
  });
  controller.abort();
  expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  complete(new Error('Parser killed'), '', '');
  await Promise.resolve();
  await Promise.resolve();
  expect(settled).toBe(false);
  child.emit('close', null, 'SIGKILL');
  await result;
  expect(settled).toBe(true);
});
