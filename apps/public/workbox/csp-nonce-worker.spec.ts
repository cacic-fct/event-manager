// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { workspaceRoot } from '@nx/devkit';
import { transform } from 'esbuild';

describe('CSP nonce service-worker helper', () => {
  it('does not shadow the service-worker global while exposing the helper', async () => {
    const source = readFileSync(join(workspaceRoot, 'libs/shared-utils/src/lib/csp-nonce.ts'), 'utf8');
    const { code } = await transform(source, {
      format: 'iife',
      globalName: 'CspNonce',
      loader: 'ts',
      minify: true,
      target: 'es2017',
    });

    expect(code).toContain('var CspNonce=');
    expect(code).not.toContain('var self=');

    const serviceWorkerGlobal: {
      addEventListener: ReturnType<typeof vi.fn>;
      CspNonce?: unknown;
    } = {
      addEventListener: vi.fn(),
    };
    new Function('self', `${code}\nself.CspNonce = CspNonce;`)(serviceWorkerGlobal);

    expect(serviceWorkerGlobal.addEventListener).toBeTypeOf('function');
    expect(serviceWorkerGlobal.CspNonce).toMatchObject({
      applyCspNonceToHtml: expect.any(Function),
      createCspNonce: expect.any(Function),
    });
  });
});
