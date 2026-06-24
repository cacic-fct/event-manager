import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const workspaceRoot = join(__dirname, '../../../..');
const sourceRoots = ['apps/backend/src', 'libs/shared-data-types/src'].map((sourceRoot) =>
  join(workspaceRoot, sourceRoot),
);

function listTypescriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stats = statSync(path);

    if (stats.isDirectory()) {
      return listTypescriptFiles(path);
    }

    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('GraphQL metadata decorators', () => {
  const files = sourceRoots.flatMap((root) => listTypescriptFiles(root));

  it('uses explicit field type functions for GraphQL models', () => {
    const violations = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      const fieldMatches = [...content.matchAll(/@Field\s*\(\s*(?!\(\s*\)\s*=>)/g)];

      return fieldMatches.map((match) => `${relative(process.cwd(), file)}:${content.slice(0, match.index).split('\n').length}`);
    });

    expect(violations).toEqual([]);
  });

  it('uses explicit argument type functions for named GraphQL args', () => {
    const violations = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      const argsMatches = [...content.matchAll(/@Args\s*\(\s*(['"`])[^'"`]+\1\s*\)/g)];

      return argsMatches.map((match) => `${relative(process.cwd(), file)}:${content.slice(0, match.index).split('\n').length}`);
    });

    expect(violations).toEqual([]);
  });
});
