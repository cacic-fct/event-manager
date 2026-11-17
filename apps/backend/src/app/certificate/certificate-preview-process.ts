import { execFile, spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { availableMemory } from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { CERTIFICATE_PREVIEW_MAX_BYTES, CERTIFICATE_PREVIEW_MAX_HTML_BYTES } from './certificate-preview-source';

const RENDER_TIMEOUT_MS = 10_000;
const TERMINATION_GRACE_MS = 250;
const MEMORY_SAMPLE_MS = 150;
const MiB = 1024 * 1024;
const MAX_RENDER_RSS_BYTES = 384 * MiB;
const HOST_MEMORY_RESERVE_BYTES = 128 * MiB;
const MIN_START_HEADROOM_BYTES = MAX_RENDER_RSS_BYTES + HOST_MEMORY_RESERVE_BYTES;

export class CertificatePreviewResourceError extends Error {}

export function hasCertificatePreviewHeadroom(): boolean {
  return availableMemory() >= MIN_START_HEADROOM_BYTES;
}

export function renderCertificatePreviewInChild(html: string, signal: AbortSignal): Promise<Buffer> {
  if (Buffer.byteLength(html) > CERTIFICATE_PREVIEW_MAX_HTML_BYTES) {
    return Promise.reject(new Error('Certificate preview HTML exceeds the rendering limit.'));
  }
  signal.throwIfAborted();
  if (!hasCertificatePreviewHeadroom()) {
    return Promise.reject(new CertificatePreviewResourceError('Insufficient memory for certificate preview.'));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=96', process.argv[1], 'render-certificate-preview'], {
      // The child needs browser tooling, with no access to application credentials
      // through its environment.
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        TMPDIR: process.env.TMPDIR,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
      },
      stdio: ['pipe', 'pipe', 'ignore'],
      detached: process.platform !== 'win32',
    });
    const chunks: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    let sampling = false;
    let cleanup: Promise<void> | undefined;
    const terminate = (error: Error) => {
      if (failure) {
        return;
      }
      failure = error;
      cleanup = stopRenderer(child);
    };
    const cancel = () => terminate(new Error('Certificate preview cancelled.'));
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
    }
    const timeout = setTimeout(
      () => terminate(new CertificatePreviewResourceError('Certificate preview exceeded its time limit.')),
      RENDER_TIMEOUT_MS,
    );
    const memoryCheck = setInterval(async () => {
      if (sampling || failure || !child.pid || child.exitCode !== null) {
        return;
      }
      sampling = true;
      try {
        const tree = process.platform === 'linux' ? await readProcessTree(child.pid) : [];
        let rss = 0;
        for (const process of tree) {
          rss += process.rss;
        }
        if (rss > MAX_RENDER_RSS_BYTES || availableMemory() < HOST_MEMORY_RESERVE_BYTES) {
          terminate(new CertificatePreviewResourceError('Certificate preview exceeded its memory budget.'));
        }
      } catch {
        terminate(new CertificatePreviewResourceError('Certificate preview memory monitor failed.'));
      } finally {
        sampling = false;
      }
    }, MEMORY_SAMPLE_MS);

    child.on('error', (error) => {
      failure ??= error;
    });
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > CERTIFICATE_PREVIEW_MAX_BYTES) {
        terminate(new Error('Certificate preview exceeded its output limit.'));
      } else {
        chunks.push(chunk);
      }
    });
    child.stdin.on('error', () => {
      // Early process exits are handled by the close listener.
    });
    child.on('close', async (code, exitSignal) => {
      clearInterval(memoryCheck);
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      await cleanup;
      if (!failure && exitSignal) {
        failure = new CertificatePreviewResourceError('Certificate preview renderer was stopped.');
      }
      if (failure || code !== 0 || !size) {
        reject(failure ?? new Error('Certificate preview renderer failed.'));
      } else {
        resolve(Buffer.concat(chunks, size));
      }
    });
    child.stdin.end(html);
  });
}

async function stopRenderer(child: ReturnType<typeof spawn>): Promise<void> {
  const pid = child.pid;
  if (!pid) {
    return;
  }

  const groups = new Set<number>();
  const collectGroups = async () => {
    if (process.platform === 'win32' || child.exitCode !== null || child.signalCode) {
      return;
    }
    const tree = await readProcessTree(pid).catch(() => []);
    for (const info of tree) {
      if (info.group === info.pid && info.pid !== pid) {
        groups.add(info.group);
      }
    }
  };

  // Playwright's Chromium launcher creates a separate process group. Record
  // it while Chromium is still a descendant, before the renderer can exit.
  await collectGroups();
  child.kill('SIGTERM');
  await delay(TERMINATION_GRACE_MS);
  if (process.platform !== 'win32' && child.exitCode === null && !child.signalCode) {
    // Prevent late browser launches while enumerating groups before the kill.
    child.kill('SIGSTOP');
    await collectGroups();
  }
  for (const group of groups) {
    killGroup(group);
  }
  if (process.platform !== 'win32') {
    killGroup(pid);
  }
  child.kill('SIGKILL');
}

function killGroup(group: number): void {
  try {
    process.kill(-group, 'SIGKILL');
  } catch {
    // The process group may already have exited during graceful shutdown.
  }
}

interface ProcessInfo {
  pid: number;
  parent: number;
  group: number;
  rss: number;
}

async function readProcessTree(root: number): Promise<ProcessInfo[]> {
  const processes = await readProcesses();
  const children = new Map<number, ProcessInfo[]>();
  for (const info of processes) {
    if (info) {
      const siblings = children.get(info.parent) ?? [];
      siblings.push(info);
      children.set(info.parent, siblings);
    }
  }
  const rootInfo = processes.find((info) => info?.pid === root);
  const tree = rootInfo ? [rootInfo] : [];
  for (const info of tree) {
    tree.push(...(children.get(info.pid) ?? []));
  }
  return tree;
}

async function readProcesses(): Promise<Array<ProcessInfo | null>> {
  if (process.platform === 'linux') {
    const entries = await readdir('/proc');
    return Promise.all(entries.filter((entry) => /^\d+$/.test(entry)).map(readProcess));
  }

  const { stdout } = await promisify(execFile)('ps', ['-axo', 'pid=,ppid=,pgid=,rss='], { timeout: 250 });
  return stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [pid, parent, group, rss] = line.trim().split(/\s+/).map(Number);
      return { pid, parent, group, rss: rss * 1024 };
    });
}

async function readProcess(entry: string): Promise<ProcessInfo | null> {
  try {
    const stat = await readFile(`/proc/${entry}/stat`, 'utf8');
    const fields = stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/);
    // RSS is reported in 4 KiB pages on the production Linux images.
    return { pid: Number(entry), parent: Number(fields[1]), group: Number(fields[2]), rss: Number(fields[21]) * 4096 };
  } catch {
    // Short-lived browser processes can disappear between readdir and readFile.
    return null;
  }
}
