import { execFile as execFileCallback } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

export async function protectCertificatePdf(pdf: Buffer): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), 'certificate-pdf-'));
  try {
    const inputFile = join(directory, 'input.pdf');
    const outputFile = join(directory, 'output.pdf');
    const jobFile = join(directory, 'encrypt.json');
    const job = {
      inputFile,
      outputFile,
      encrypt: {
        userPassword: '',
        ownerPassword: randomBytes(32).toString('hex'),
        '256bit': { modify: 'none' },
      },
    };

    await writeFile(inputFile, pdf, { mode: 0o600 });
    // Keep the owner password out of the process arguments.
    await writeFile(jobFile, JSON.stringify(job), { mode: 0o600 });
    await execFile('qpdf', [`--job-json-file=${jobFile}`], { timeout: 30_000 });
    return await readFile(outputFile);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
