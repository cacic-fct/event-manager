import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { getLibraryStoryGlobs } from './storybook-library-stories.mjs';

test('discovers new shared catalogs and keeps admin/backend-only catalogs in admin', (context) => {
  const root = mkdtempSync(join(tmpdir(), 'storybook-library-discovery-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  for (const [name, tags, story] of [
    ['shared-ui', ['scope:shared'], 'button.stories.ts'],
    ['public-ui', ['scope:public'], 'introduction.mdx'],
    ['organizer-ui', ['scope:admin'], 'editor.stories.ts'],
    ['backend-tools', ['scope:backend'], 'inspector.stories.ts'],
    ['shared-organizer-ui', ['scope:shared', 'storybook:admin'], 'review.stories.ts'],
    ['contracts', ['scope:shared'], null],
  ]) {
    const directory = join(root, 'libs', name);
    mkdirSync(join(directory, 'src', 'nested'), { recursive: true });
    writeFileSync(join(directory, 'project.json'), JSON.stringify({ tags, sourceRoot: `libs/${name}/src` }));
    if (story) {
      writeFileSync(join(directory, 'src', 'nested', story), '');
    }
  }

  const names = (audience) => getLibraryStoryGlobs(audience, root).map((glob) => glob.split('/')[4]);
  assert.deepEqual(names('public'), ['public-ui', 'shared-ui']);
  assert.deepEqual(names('admin'), ['backend-tools', 'organizer-ui', 'shared-organizer-ui']);
});
