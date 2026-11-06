import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

const child = Object.assign(new EventEmitter(), {
  pid: 12345,
  exitCode: null,
  stdin: new PassThrough(),
  stdout: new PassThrough(),
  kill: jest.fn(),
});
const spawn = jest.fn(() => child);
jest.unstable_mockModule('node:child_process', () => ({ spawn }));
const { renderCertificatePreviewInChild } = await import('./certificate-preview-process');

it('kills the renderer process group on cancellation before any memory sample', async () => {
  const kill = jest.spyOn(process, 'kill').mockReturnValue(true);
  const controller = new AbortController();
  try {
    const rendering = renderCertificatePreviewInChild('<main>Certificate</main>', controller.signal);
    controller.abort();
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({
        detached: process.platform !== 'win32',
      }),
    );
    if (process.platform !== 'win32') {
      expect(kill).toHaveBeenCalledWith(-child.pid, 'SIGKILL');
    }
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('close', null, 'SIGKILL');
    await expect(rendering).rejects.toThrow('cancelled');
  } finally {
    kill.mockRestore();
  }
});
