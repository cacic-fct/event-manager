import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const PUBLIC_CERTIFICATE_HOST = 'eventos.cacic.com.br';
const MAX_PDF_TEXT_BYTES = 128 * 1024;
const MAX_PDF_ADDRESS_SPACE_BYTES = 128 * 1024 * 1024;
const PDF_PROCESS_OPTIONS = {
  encoding: 'utf8',
  timeout: 30_000,
  maxBuffer: MAX_PDF_TEXT_BYTES,
  killSignal: 'SIGKILL',
} as const;

export function findCertificatePdfId(text: string, configuredOrigin?: string): string | null {
  const configuredHost = new URL(configuredOrigin || 'http://localhost:4200').host;
  const hosts = [PUBLIC_CERTIFICATE_HOST, configuredHost].map((host) => host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // The printed verification link may wrap within the ID. Do not join across pages.
  const uuid = [8, 4, 4, 4, 12]
    .map((length) => `(?:[a-f0-9][ \\t\\r\\n]*){${length - 1}}[a-f0-9]`)
    .join('[ \\t\\r\\n]*-[ \\t\\r\\n]*');
  const link = new RegExp(
    `(?<![\\w./@-])(?:https?://)?(?:${hosts.join('|')})/[ \\t\\r\\n]*validar/[ \\t\\r\\n]*(${uuid})(?![\\w/%-])`,
    'gi',
  );
  const ids = new Set(Array.from(text.matchAll(link), ([, id]) => id.replace(/\s/g, '').toLowerCase()));
  return ids.size === 1 ? [...ids][0] : null;
}

export async function extractCertificatePdfId(pdf: Buffer, signal?: AbortSignal): Promise<string | null> {
  signal?.throwIfAborted();
  const args = ['-q', '-enc', 'UTF-8', '-raw', '-', '-'];
  // Allow slower hosts and CPU contention while bounding parser memory and execution time.
  const parser =
    process.platform === 'linux'
      ? execFile(
          'prlimit',
          [`--as=${MAX_PDF_ADDRESS_SPACE_BYTES}`, '--cpu=8', '--core=0', '--', 'pdftotext', ...args],
          PDF_PROCESS_OPTIONS,
        )
      : execFile('pdftotext', args, PDF_PROCESS_OPTIONS);
  // Aborting execFile via its signal option rejects before the child stops. Keep
  // admission occupied until close, including timeout and output-limit failures.
  const closed = new Promise<void>((resolve) => parser.child.once('close', () => resolve()));
  const cancel = () => {
    parser.child.kill('SIGKILL');
  };
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) {
    cancel();
  }
  // A malformed file or exhausted limit can close stdin before the write completes.
  parser.child.stdin?.on('error', () => undefined);
  parser.child.stdin?.end(pdf);
  try {
    const { stdout } = await parser;
    signal?.throwIfAborted();
    return findCertificatePdfId(stdout, process.env.PUBLIC_APP_ORIGIN?.trim());
  } finally {
    await closed;
    signal?.removeEventListener('abort', cancel);
  }
}
