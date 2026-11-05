import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { protectCertificatePdf } from './protect-certificate-pdf';

const qpdfMissing = spawnSync('qpdf', ['--version']).error?.code === 'ENOENT';
const testWithQpdf = qpdfMissing && !process.env.CI ? it.skip : it;

testWithQpdf('encrypts PDFs with an empty user password and denies modification (requires qpdf on PATH)', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'certificate-pdf-test-'));
  try {
    const pdf = execFileSync('qpdf', ['--empty', '-']);
    const protectedFile = join(directory, 'protected.pdf');
    await writeFile(protectedFile, await protectCertificatePdf(pdf));

    const encryption = execFileSync('qpdf', ['--show-encryption', protectedFile], { encoding: 'utf8' });
    expect(encryption).toContain('Supplied password is user password');
    expect(encryption).toContain('file encryption method: AESv3');
    expect(encryption).toContain('modify anything: not allowed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
