import { jest } from '@jest/globals';
import { execFile, spawn as spawnProcess, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';

const child = Object.assign(new EventEmitter(), {
  pid: undefined,
  exitCode: null,
  stdin: new PassThrough(),
  stdout: new PassThrough(),
});
const spawn = jest.fn<(command: string, args: string[], options: SpawnOptions) => ChildProcess>();
const availableMemory = jest.fn(() => 1024 ** 3);
jest.unstable_mockModule('node:child_process', () => ({ execFile, spawn }));
jest.unstable_mockModule('node:process', () => ({ availableMemory }));
const { CertificatePreviewResourceError, renderCertificatePreviewInChild } = await import(
  './certificate-preview-process'
);

afterEach(() => {
  spawn.mockReset();
  availableMemory.mockClear();
});

it('checks memory headroom before starting the renderer', async () => {
  availableMemory.mockReturnValueOnce(511 * 1024 ** 2);
  await expect(
    renderCertificatePreviewInChild('<main>Certificate</main>', new AbortController().signal),
  ).rejects.toBeInstanceOf(CertificatePreviewResourceError);
  expect(spawn).not.toHaveBeenCalled();
});

it('keeps a cancelled render pending until the child closes', async () => {
  spawn.mockReturnValueOnce(child as unknown as ChildProcess);
  const controller = new AbortController();
  const rendering = renderCertificatePreviewInChild('<main>Certificate</main>', controller.signal);
  const settled = jest.fn();
  void rendering.then(settled, settled);
  controller.abort();

  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).not.toHaveBeenCalled();
  child.emit('close', null, 'SIGKILL');
  await expect(rendering).rejects.toThrow('cancelled');
});

const testOnPosix = process.platform === 'win32' ? it.skip : it;
testOnPosix('stops a separate browser process group when graceful cancellation fails', async () => {
  let renderer!: ChildProcess;
  spawn.mockImplementationOnce((_command, _args, options) => {
    renderer = spawnProcess(
      process.execPath,
      [
        '-e',
        `
      const { spawn } = require('node:child_process');
      const browser = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        detached: true, stdio: 'ignore',
      });
      process.on('SIGTERM', () => {});
      browser.once('spawn', () => console.log(browser.pid));
    `,
      ],
      options,
    );
    return renderer;
  });
  const controller = new AbortController();
  const rendering = renderCertificatePreviewInChild('<main>Certificate</main>', controller.signal);
  const cancelled = expect(rendering).rejects.toThrow('cancelled');
  let browserPid: number | undefined;
  try {
    if (!renderer.stdout) {
      throw new Error('Expected renderer stdout to be piped.');
    }
    const [stdout] = await once(renderer.stdout, 'data');
    browserPid = Number(stdout.toString().trim());
    expect(browserPid).toBeGreaterThan(0);
    controller.abort();
    await cancelled;

    // On Linux a terminated orphan can still have a /proc entry until PID 1 reaps it.
    const { stdout: status } = await promisify(execFile)('ps', ['-p', String(browserPid), '-o', 'stat=']).catch(
      (error: { code?: number }) => {
        if (error.code === 1) {
          return { stdout: '' };
        }
        throw error;
      },
    );
    expect(status.trim()).toMatch(/^(?:Z.*)?$/);
    browserPid = undefined;
  } finally {
    controller.abort();
    if (browserPid) {
      try {
        process.kill(-browserPid, 'SIGKILL');
      } catch {
        // The browser group has already exited.
      }
    }
  }
});
